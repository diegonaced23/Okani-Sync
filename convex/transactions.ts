import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { getCurrentUser, getCurrentUserId } from "./lib/auth";
import { assertCanRead, assertCanWrite } from "./lib/permissions";
import { toMonthString, generateId, assertValidMonth } from "./lib/utils";

import {
  applyAccountDelta,
  applyCardDelta,
  applyBudgetDelta,
  applyGoalDelta,
  deleteTransactionWithEffects,
} from "./lib/transactionEffects";
import { getUserRateMap, convertAmount } from "./lib/money";

// ─── Queries ──────────────────────────────────────────────────────────────────

export const listByMonth = query({
  args: { month: v.string() },
  handler: async (ctx, { month }) => {
    assertValidMonth(month);
    const clerkId = await getCurrentUserId(ctx);
    // Techo de 300 registros para prevenir payloads reactivos ilimitados.
    // La paginación real (paginate/usePaginatedQuery) queda en P3 porque los
    // totales del mes se calculan en el cliente sobre el array completo.
    return await ctx.db
      .query("transactions")
      .withIndex("by_user_month", (q) =>
        q.eq("userId", clerkId).eq("month", month)
      )
      .order("desc")
      .take(300);
  },
});

/**
 * Exportación completa del libro de movimientos para uno o varios meses.
 * Devuelve TODOS los tipos (incluyendo gasto_tarjeta, transferencias y ajustes),
 * ordenados por fecha ascendente — listos para `generateFullLedgerCsv`.
 * Máximo 12 meses para evitar respuestas demasiado grandes.
 */
export const listForExport = query({
  args: { months: v.array(v.string()) },
  handler: async (ctx, { months }) => {
    const clerkId = await getCurrentUserId(ctx);
    const safeMonths = months.slice(0, 12);
    const byMonth = await Promise.all(
      safeMonths.map((month) =>
        ctx.db
          .query("transactions")
          .withIndex("by_user_month", (q) => q.eq("userId", clerkId).eq("month", month))
          .collect()
      )
    );
    return byMonth.flat().sort((a, b) => a.date - b.date);
  },
});

export const listByAccountMonth = query({
  args: { accountId: v.id("accounts"), month: v.string() },
  handler: async (ctx, { accountId, month }) => {
    assertValidMonth(month);
    await assertCanRead(ctx, accountId);
    return await ctx.db
      .query("transactions")
      .withIndex("by_account_month", (q) =>
        q.eq("accountId", accountId).eq("month", month)
      )
      .order("desc")
      .collect();
  },
});

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 10 }) => {
    const clerkId = await getCurrentUserId(ctx);
    const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 100);

    // Pool grande: las gasto_tarjeta tienen date = fecha de vencimiento (futura),
    // lo que las desplaza al tope del índice by_user_date. Tomamos más candidatos
    // para asegurar suficiente variedad tras reordenar por fecha real.
    const candidates = await ctx.db
      .query("transactions")
      .withIndex("by_user_date", (q) => q.eq("userId", clerkId))
      .order("desc")
      .take(Math.min(safeLimit * 15, 300));

    type TxWithEffectiveDate = (typeof candidates)[number] & { date: number };

    // Separar gasto_tarjeta del resto para batch-resolverlos en paralelo
    const cardCandidates = candidates.filter(
      tx => tx.type === "gasto_tarjeta" && tx.cardInstallmentId != null
    );
    const nonCardTxs = candidates.filter(
      tx => tx.type !== "gasto_tarjeta"
    ) as TxWithEffectiveDate[];

    // Batch 1: resolver todas las cuotas a la vez (evita N awaits serializados)
    const installments = await Promise.all(
      cardCandidates.map(tx => ctx.db.get(tx.cardInstallmentId!))
    );

    // Solo cuota #1 representa el momento de compra; las siguientes son cargos futuros
    const firstPairs = cardCandidates
      .map((tx, i) => ({ tx, inst: installments[i] }))
      .filter(({ inst }) => inst?.installmentNumber === 1);

    // Batch 2: resolver compras originales a la vez
    const purchases = await Promise.all(
      firstPairs.map(({ tx }) =>
        tx.cardPurchaseId ? ctx.db.get(tx.cardPurchaseId) : null
      )
    );

    const enrichedCardTxs: TxWithEffectiveDate[] = firstPairs.map(({ tx }, i) => ({
      ...tx,
      date: purchases[i]?.purchaseDate ?? tx._creationTime,
    }));

    const enriched: TxWithEffectiveDate[] = [...nonCardTxs, ...enrichedCardTxs];

    // Re-ordenar por fecha efectiva porque las gasto_tarjeta tenían fechas futuras.
    enriched.sort((a, b) => b.date - a.date);

    return enriched.slice(0, safeLimit);
  },
});

export const getById = query({
  args: { transactionId: v.id("transactions") },
  handler: async (ctx, { transactionId }) => {
    const clerkId = await getCurrentUserId(ctx);
    const tx = await ctx.db.get(transactionId);
    if (!tx) return null;
    // Acceso directo si es el dueño
    if (tx.userId === clerkId) return tx;
    // Para cuentas compartidas: verificar permiso de lectura sobre la cuenta de la transacción.
    // assertCanRead lanza si no hay acceso; retornamos null para mantener el contrato de fetch-one.
    if (tx.accountId) {
      try {
        await assertCanRead(ctx, tx.accountId);
        return tx;
      } catch {
        return null;
      }
    }
    return null;
  },
});

/**
 * Compromisos de pago en los próximos N días para el widget del dashboard.
 *
 * Fuentes (sin doble-conteo):
 * - Cuotas de tarjeta: unpaid, dueDate ≤ hoy+N (incluye vencidas)
 * - Deudas activas/vencidas: dueDate ≤ hoy+N → monto = monthlyPayment ?? currentBalance
 * - Transacciones recurrentes tipo "gasto": nextOccurrence en [ahora, hoy+N]
 *   (pago_tarjeta y pago_deuda se excluyen — ya cubiertos por las dos fuentes anteriores)
 */
export const upcomingCommitments = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, { days = 30 }) => {
    const user = await getCurrentUser(ctx);
    const { rateMap, preferredCurrency } = await getUserRateMap(ctx, user);
    const missingRateSet = new Set<string>();

    const safeDays = Math.min(Math.max(1, Math.floor(days)), 365);
    const now = Date.now();
    const windowEnd = now + safeDays * 86_400_000;

    function convert(amountCents: number, fromCurrency: string): number {
      const { converted, hasRate } = convertAmount(amountCents, fromCurrency, preferredCurrency, rateMap);
      if (!hasRate && fromCurrency !== preferredCurrency) missingRateSet.add(fromCurrency);
      return converted;
    }

    type CommitmentItem = {
      type: "cuota_tarjeta" | "deuda" | "recurrente";
      amount: number;
      dueDate: number;
      description: string;
      cardName?: string;
    };
    const items: CommitmentItem[] = [];

    // ── Cuotas de tarjeta ─────────────────────────────────────────────────────
    const allUnpaid = await ctx.db
      .query("cardInstallments")
      .withIndex("by_user_paid", (q) => q.eq("userId", user.clerkId).eq("paid", false))
      .collect();
    const relevantInst = allUnpaid.filter((i) => i.dueDate <= windowEnd);

    // Batch-lookup por purchaseId y cardId únicos
    const seenPurchases = new Map<string, { description: string; totalInstallments: number }>();
    const seenCards = new Map<string, { name: string; lastFourDigits: string; currency: string }>();
    for (const inst of relevantInst) {
      if (!seenPurchases.has(inst.purchaseId)) {
        const p = await ctx.db.get(inst.purchaseId);
        seenPurchases.set(inst.purchaseId, { description: p?.description ?? "Cuota", totalInstallments: p?.totalInstallments ?? 1 });
      }
      if (!seenCards.has(inst.cardId)) {
        const c = await ctx.db.get(inst.cardId);
        if (c) seenCards.set(inst.cardId, { name: c.name, lastFourDigits: c.lastFourDigits, currency: c.currency });
      }
    }

    for (const inst of relevantInst) {
      const purchase = seenPurchases.get(inst.purchaseId)!;
      const card = seenCards.get(inst.cardId);
      const desc = purchase.totalInstallments > 1
        ? `${purchase.description} — Cuota ${inst.installmentNumber}/${purchase.totalInstallments}`
        : purchase.description;
      items.push({
        type: "cuota_tarjeta",
        amount: convert(inst.amount, card?.currency ?? preferredCurrency),
        dueDate: inst.dueDate,
        description: desc,
        cardName: card ? `${card.name} ····${card.lastFourDigits}` : undefined,
      });
    }

    // ── Deudas activas y vencidas ─────────────────────────────────────────────
    const [activeDebts, overdueDebts] = await Promise.all([
      ctx.db.query("debts").withIndex("by_user_status", (q) => q.eq("userId", user.clerkId).eq("status", "activa")).collect(),
      ctx.db.query("debts").withIndex("by_user_status", (q) => q.eq("userId", user.clerkId).eq("status", "vencida")).collect(),
    ]);
    for (const debt of [...activeDebts, ...overdueDebts]) {
      if (debt.dueDate === undefined || debt.dueDate > windowEnd) continue;
      const amount = debt.monthlyPayment ?? debt.currentBalance;
      items.push({
        type: "deuda",
        amount: convert(amount, debt.currency),
        dueDate: debt.dueDate,
        description: `${debt.name} — ${debt.creditor}`,
      });
    }

    // ── Transacciones recurrentes tipo gasto ──────────────────────────────────
    // pago_tarjeta y pago_deuda se excluyen — sus obligaciones ya aparecen arriba.
    const recurring = await ctx.db
      .query("recurringTransactions")
      .withIndex("by_user_active", (q) => q.eq("userId", user.clerkId).eq("active", true))
      .collect();
    for (const rec of recurring) {
      if (rec.type !== "gasto") continue;
      if (rec.nextOccurrence < now || rec.nextOccurrence > windowEnd) continue;
      items.push({
        type: "recurrente",
        amount: convert(rec.amount, rec.currency),
        dueDate: rec.nextOccurrence,
        description: rec.description,
      });
    }

    items.sort((a, b) => a.dueDate - b.dueDate);
    const totalAmount = items.reduce((s, i) => s + i.amount, 0);

    return { totalAmount, currency: preferredCurrency, missingRates: [...missingRateSet], items };
  },
});

/**
 * Búsqueda y filtrado avanzado de transacciones.
 *
 * Cuando `text` está presente usa el índice de búsqueda full-text sobre `description`
 * (relevancia + filtro por userId/type en la BD). Para el resto de filtros aplica
 * `.filter()` en memoria sobre el conjunto acotado devuelto por el índice.
 *
 * Cuando `text` está vacío y hay filtros de fecha, usa `by_user_date` con rango,
 * lo que es eficiente y exacto sin necesidad de escanear toda la tabla.
 *
 * Nota: el `searchIndex` físico se activa al hacer `npx convex dev` — el TypeScript
 * ya tipechea correctamente porque DataModel se deriva de schema.ts en compilación.
 */
export const search = query({
  args: {
    text:       v.optional(v.string()),
    fromDate:   v.optional(v.number()),
    toDate:     v.optional(v.number()),
    type:       v.optional(v.string()),
    accountId:  v.optional(v.id("accounts")),
    categoryId: v.optional(v.id("categories")),
  },
  handler: async (ctx, args) => {
    const clerkId = await getCurrentUserId(ctx);
    const trimmed = args.text?.trim() ?? "";

    let results;

    if (trimmed.length > 0) {
      // Full-text search: devuelve máx 200 resultados ordenados por relevancia
      const q = ctx.db
        .query("transactions")
        .withSearchIndex("search_description", (q) => {
          const base = q.search("description", trimmed).eq("userId", clerkId);
          // Filtrar tipo en el índice cuando está disponible
          return args.type ? base.eq("type", args.type as "ingreso" | "gasto" | "transferencia" | "pago_tarjeta" | "pago_deuda" | "gasto_tarjeta" | "ajuste") : base;
        });
      results = await q.take(200);
    } else {
      // Sin texto: usar by_user_date con rango opcional
      results = await ctx.db
        .query("transactions")
        .withIndex("by_user_date", (q) => {
          const base = q.eq("userId", clerkId);
          if (args.fromDate !== undefined && args.toDate !== undefined) {
            return base.gte("date", args.fromDate).lte("date", args.toDate);
          }
          if (args.fromDate !== undefined) return base.gte("date", args.fromDate);
          if (args.toDate !== undefined) return base.lte("date", args.toDate);
          return base;
        })
        .order("desc")
        .take(300);
    }

    // Filtros secundarios en memoria (acotados al conjunto ya reducido)
    return results.filter((tx) => {
      if (trimmed.length === 0 && args.type && tx.type !== args.type) return false;
      if (args.accountId  && tx.accountId  !== args.accountId)  return false;
      if (args.categoryId && tx.categoryId !== args.categoryId) return false;
      if (trimmed.length > 0 && args.fromDate !== undefined && tx.date < args.fromDate) return false;
      if (trimmed.length > 0 && args.toDate   !== undefined && tx.date > args.toDate)   return false;
      return true;
    });
  },
});

/** Gastos del mes agrupados por categoría — para el gráfico Pie del dashboard.
 *  Solo incluye gastos directos (type="gasto"); las cuotas de tarjeta se gestionan
 *  en el módulo de tarjetas y no se suman aquí para evitar doble conteo. */
export const spendingByCategory = query({
  args: { month: v.string() },
  handler: async (ctx, { month }) => {
    assertValidMonth(month);
    const user = await getCurrentUser(ctx);
    const { rateMap, preferredCurrency } = await getUserRateMap(ctx, user);
    // Sin tasa disponible: se excluye del total en vez de sumar el monto crudo sin convertir.
    function toPreferred(amount: number, currency: string): number {
      const { converted, hasRate } = convertAmount(amount, currency, preferredCurrency, rateMap);
      return hasRate ? converted : 0;
    }

    // Gastos del mes en base devengo — misma definición que monthlySummary.gastos y
    // financialHealthMetrics: gasto directo de cuenta + gasto_tarjeta (compra a crédito,
    // se cuenta en el momento de la compra, no cuando se paga la tarjeta).
    const [gastos, gastosTarjeta, pagosDeuda] = await Promise.all([
      ctx.db
        .query("transactions")
        .withIndex("by_user_type_month", (q) =>
          q.eq("userId", user.clerkId).eq("type", "gasto").eq("month", month)
        )
        .collect(),
      ctx.db
        .query("transactions")
        .withIndex("by_user_type_month", (q) =>
          q.eq("userId", user.clerkId).eq("type", "gasto_tarjeta").eq("month", month)
        )
        .collect(),
      ctx.db
        .query("transactions")
        .withIndex("by_user_type_month", (q) =>
          q.eq("userId", user.clerkId).eq("type", "pago_deuda").eq("month", month)
        )
        .collect(),
    ]);

    const grouped = new Map<string, { amount: number; categoryId: string | null }>();
    for (const tx of [...gastos, ...gastosTarjeta]) {
      const converted = toPreferred(tx.amount, tx.currency);
      const key = tx.categoryId ?? "__none__";
      const existing = grouped.get(key);
      if (existing) {
        existing.amount += converted;
      } else {
        grouped.set(key, { amount: converted, categoryId: tx.categoryId ?? null });
      }
    }

    // Batch-load de categorías del usuario: evita N round-trips individuales.
    const allCats = await ctx.db
      .query("categories")
      .withIndex("by_user", (q) => q.eq("userId", user.clerkId))
      .collect();
    const catMap = new Map(allCats.map((c) => [c._id.toString(), c]));

    const items = [...grouped.entries()].map(([key, data]) => {
      if (key === "__none__" || !data.categoryId) {
        return { name: "Sin categoría", amount: data.amount, color: "#6B7280" };
      }
      const cat = catMap.get(data.categoryId.toString());
      return {
        name: cat?.name ?? "Sin categoría",
        amount: data.amount,
        color: cat?.color ?? "#6B7280",
      };
    });

    // Pagos de deuda del mes — no tienen categoría propia, se agrupan como un solo bucket
    // (igual patrón que usaba antes "Pago de tarjeta"), para reconciliar con monthlySummary.gastos.
    const totalPagosDeuda = pagosDeuda.reduce((s, t) => s + toPreferred(t.amount, t.currency), 0);

    if (totalPagosDeuda > 0) {
      items.push({ name: "Pago de deuda", amount: totalPagosDeuda, color: "#EF4444" });
    }

    return items.sort((a, b) => b.amount - a.amount);
  },
});

/** Gastos del mes agrupados por cuenta o tarjeta — para el gráfico de barras del dashboard. */
export const spendingBySource = query({
  args: { month: v.string() },
  handler: async (ctx, { month }) => {
    assertValidMonth(month);
    const user = await getCurrentUser(ctx);
    const { rateMap, preferredCurrency } = await getUserRateMap(ctx, user);
    // Sin tasa disponible: se excluye del total en vez de sumar el monto crudo sin convertir.
    function toPreferred(amount: number, currency: string): number {
      const { converted, hasRate } = convertAmount(amount, currency, preferredCurrency, rateMap);
      return hasRate ? converted : 0;
    }

    // Misma definición base devengo que spendingByCategory/monthlySummary: gasto directo +
    // gasto_tarjeta (compra a crédito, fuente real es la tarjeta) + pago_deuda (fuente: cuenta).
    const gastos = await ctx.db
      .query("transactions")
      .withIndex("by_user_type_month", (q) =>
        q.eq("userId", user.clerkId).eq("type", "gasto").eq("month", month)
      )
      .collect();

    // Compras a crédito: la fuente real es la tarjeta (no descuentan cuenta)
    const gastosTarjeta = await ctx.db
      .query("transactions")
      .withIndex("by_user_type_month", (q) =>
        q.eq("userId", user.clerkId).eq("type", "gasto_tarjeta").eq("month", month)
      )
      .collect();

    // Pagos de deuda: el efectivo sale de la cuenta (accountId)
    const pagosDeuda = await ctx.db
      .query("transactions")
      .withIndex("by_user_type_month", (q) =>
        q.eq("userId", user.clerkId).eq("type", "pago_deuda").eq("month", month)
      )
      .collect();

    // Para pago_deuda la fuente es la cuenta debitada (accountId), no una tarjeta destino
    const txs = [
      ...gastos,
      ...gastosTarjeta,
      ...pagosDeuda.map((t) => ({ ...t, cardId: undefined })),
    ];

    // Agrupa por accountId o cardId con importes convertidos a la moneda preferida
    const grouped = new Map<string, {
      amount: number;
      sourceId: string | null;
      sourceType: "account" | "card" | "none";
    }>();

    for (const tx of txs) {
      const converted = toPreferred(tx.amount, tx.currency);
      const key = tx.accountId ?? tx.cardId ?? "__none__";
      const sourceType = tx.accountId ? "account" : tx.cardId ? "card" : "none";
      const existing = grouped.get(key);
      if (existing) {
        existing.amount += converted;
      } else {
        grouped.set(key, {
          amount: converted,
          sourceId: (tx.accountId ?? tx.cardId) ?? null,
          sourceType,
        });
      }
    }

    // Batch-load de cuentas y tarjetas: evita N round-trips individuales.
    // Se usan los IDs ya presentes en `grouped` para cubrir cuentas compartidas sin asumir ownership.
    const accountIds = new Set<string>();
    const cardIds = new Set<string>();
    for (const [key, data] of grouped.entries()) {
      if (key === "__none__") continue;
      if (data.sourceType === "account") accountIds.add(data.sourceId!);
      else if (data.sourceType === "card") cardIds.add(data.sourceId!);
    }
    const [accountsRaw, cardsRaw] = await Promise.all([
      Promise.all([...accountIds].map((id) => ctx.db.get(id as Id<"accounts">))),
      Promise.all([...cardIds].map((id) => ctx.db.get(id as Id<"cards">))),
    ]);
    const accountMap = new Map(
      accountsRaw
        .filter((a): a is NonNullable<typeof a> => a !== null)
        .map((a) => [a._id.toString(), a])
    );
    const cardMap = new Map(
      cardsRaw
        .filter((c): c is NonNullable<typeof c> => c !== null)
        .map((c) => [c._id.toString(), c])
    );

    const results = [...grouped.entries()].map(([key, data]) => {
      if (key === "__none__") {
        return { name: "Sin fuente", amount: data.amount, color: "#6B7280" };
      }
      if (data.sourceType === "account") {
        const acc = accountMap.get(data.sourceId!);
        return {
          name: acc?.name ?? "Cuenta eliminada",
          amount: data.amount,
          color: acc?.color ?? "#6B7280",
        };
      }
      const card = cardMap.get(data.sourceId!);
      return {
        name: card ? `${card.name} ····${card.lastFourDigits}` : "Tarjeta eliminada",
        amount: data.amount,
        color: card?.color ?? "#6B7280",
      };
    });

    return results.sort((a, b) => b.amount - a.amount);
  },
});

/** Totales de ingresos y gastos por mes — para el LineChart de 6 meses. */
export const monthlySummary = query({
  args: { months: v.array(v.string()) },
  handler: async (ctx, { months }) => {
    // Cap en 12 — el dashboard usa 6 meses (lastNMonths(6)); 12 es el techo razonable para exportes
    const safeMonths = months.slice(0, 12);
    // Validar formato antes de consultar el índice — un valor malformado corrompería la query
    safeMonths.forEach(assertValidMonth);
    const user = await getCurrentUser(ctx);
    const { rateMap, preferredCurrency } = await getUserRateMap(ctx, user);
    // Sin tasa disponible: se excluye del total en vez de sumar el monto crudo sin convertir.
    function toPreferred(amount: number, currency: string): number {
      const { converted, hasRate } = convertAmount(amount, currency, preferredCurrency, rateMap);
      return hasRate ? converted : 0;
    }

    return await Promise.all(
      safeMonths.map(async (month) => {
        const txs = await ctx.db
          .query("transactions")
          .withIndex("by_user_month", (q) =>
            q.eq("userId", user.clerkId).eq("month", month)
          )
          .collect();

        const ingresos = txs
          .filter((t) => t.type === "ingreso")
          .reduce((s, t) => s + toPreferred(t.amount, t.currency), 0);
        const gastos = txs
          .filter((t) => t.type === "gasto" || t.type === "gasto_tarjeta" || t.type === "pago_deuda")
          .reduce((s, t) => s + toPreferred(t.amount, t.currency), 0);

        return { month, ingresos, gastos };
      })
    );
  },
});

/** Gastos con tarjeta — todas las txs gasto_tarjeta de una tarjeta, ordenadas desc. */
export const listDirectByCard = query({
  args: { cardId: v.id("cards") },
  handler: async (ctx, { cardId }) => {
    const clerkId = await getCurrentUserId(ctx);
    const card = await ctx.db.get(cardId);
    if (!card || card.userId !== clerkId) return [];

    const all = await ctx.db
      .query("transactions")
      .withIndex("by_card", (q) => q.eq("cardId", cardId))
      .order("desc")
      .collect();

    return all.filter((tx) => tx.type === "gasto_tarjeta");
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    type: v.union(
      v.literal("ingreso"),
      v.literal("gasto"),
      v.literal("pago_tarjeta"),
      v.literal("pago_deuda")
    ),
    amount: v.number(),      // en centavos
    description: v.string(),
    date: v.number(),
    currency: v.string(),
    accountId: v.optional(v.id("accounts")),
    cardId: v.optional(v.id("cards")),
    categoryId: v.optional(v.id("categories")),
    goalId: v.optional(v.id("goals")),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    receiptStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    if (args.amount <= 0 || !Number.isFinite(args.amount)) throw new Error("El monto debe ser mayor que cero");
    if (args.amount > 9_999_999_999) throw new Error("Monto fuera de rango permitido");
    if (args.description.length === 0 || args.description.length > 200) throw new Error("La descripción debe tener entre 1 y 200 caracteres");
    if (!/^[A-Za-z]{3}$/.test(args.currency)) throw new Error("Código de moneda inválido");
    if (args.notes !== undefined && args.notes.length > 500) throw new Error("Las notas no pueden superar 500 caracteres");
    if (args.accountId && args.cardId) throw new Error("Una transacción no puede asociarse a cuenta y tarjeta al mismo tiempo");
    if (args.cardId && args.type === "gasto") throw new Error("Los gastos con tarjeta de crédito se registran vía cardPurchases.createPurchase");

    // Validación nominal de MIME type del comprobante (el contentType es declarado por el cliente,
    // no verificado por magic bytes — defensa-en-profundidad, no garantía de contenido)
    if (args.receiptStorageId !== undefined) {
      const meta = await ctx.storage.getMetadata(args.receiptStorageId);
      const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
      if (!meta || !meta.contentType || !allowed.includes(meta.contentType)) {
        throw new Error("El comprobante debe ser una imagen (JPEG, PNG, WebP) o PDF");
      }
    }

    const user = await getCurrentUser(ctx);

    // Rate limiting: máximo 30 transacciones por minuto por usuario
    const latestTxs = await ctx.db
      .query("transactions")
      .withIndex("by_user", (q) => q.eq("userId", user.clerkId))
      .order("desc")
      .take(31);
    const cutoff = Date.now() - 60_000;
    if (latestTxs.filter((t) => t.createdAt >= cutoff).length >= 30) {
      throw new Error("Demasiadas transacciones en poco tiempo. Intenta de nuevo en un minuto.");
    }

    if (args.accountId) {
      await assertCanWrite(ctx, args.accountId);
    }
    if (args.cardId) {
      const card = await ctx.db.get(args.cardId);
      if (!card || card.userId !== user.clerkId) throw new Error("Tarjeta no encontrada");
    }

    const month = toMonthString(args.date);
    const now = Date.now();

    // Validar meta si se especifica (solo en gastos, y no en metas vinculadas a cuenta)
    if (args.goalId) {
      if (args.type !== "gasto") throw new Error("Solo los gastos pueden vincularse a una meta de ahorro");
      const goal = await ctx.db.get(args.goalId);
      if (!goal || goal.userId !== user.clerkId) throw new Error("Meta de ahorro no encontrada");
      if (goal.linkedAccountId) throw new Error("Esta meta está vinculada a una cuenta de ahorro. Transfiere dinero a esa cuenta para actualizar el progreso automáticamente.");
    }

    const txId = await ctx.db.insert("transactions", {
      userId: user.clerkId,
      type: args.type,
      amount: args.amount,
      description: args.description,
      date: args.date,
      month,
      currency: args.currency,
      accountId: args.accountId,
      cardId: args.cardId,
      categoryId: args.categoryId,
      goalId: args.goalId,
      notes: args.notes,
      tags: args.tags,
      receiptStorageId: args.receiptStorageId,
      status: "completada",
      isRecurring: false,
      createdAt: now,
      updatedAt: now,
    });

    // Actualizar saldo de la cuenta
    if (args.accountId) {
      const delta = args.type === "ingreso" ? args.amount : -args.amount;
      await applyAccountDelta(ctx, args.accountId, delta);
    }

    // Recalcular budget.spent si es gasto con categoría
    if (args.type === "gasto" && args.categoryId) {
      await applyBudgetDelta(ctx, user.clerkId, args.categoryId, month, args.amount, args.currency);
    }

    // Abonar a la meta de ahorro (ahorro en casa / efectivo)
    if (args.goalId && args.type === "gasto") {
      await applyGoalDelta(ctx, args.goalId, args.amount);
    }

    return txId;
  },
});

export const update = mutation({
  args: {
    transactionId: v.id("transactions"),
    description:   v.optional(v.string()),
    amount:        v.optional(v.number()),
    accountId:     v.optional(v.id("accounts")),
    cardId:        v.optional(v.id("cards")),
    categoryId:    v.optional(v.id("categories")),
    notes:         v.optional(v.string()),
    tags:          v.optional(v.array(v.string())),
    date:          v.optional(v.number()),
  },
  handler: async (ctx, { transactionId, ...fields }) => {
    if (fields.description !== undefined && (fields.description.length === 0 || fields.description.length > 200)) {
      throw new Error("La descripción debe tener entre 1 y 200 caracteres");
    }
    if (fields.amount !== undefined && (fields.amount <= 0 || !Number.isFinite(fields.amount) || fields.amount > 9_999_999_999)) {
      throw new Error("El monto debe ser mayor que cero");
    }
    if (fields.notes !== undefined && fields.notes.length > 500) throw new Error("Las notas no pueden superar 500 caracteres");
    if (fields.accountId !== undefined && fields.cardId !== undefined) {
      throw new Error("Una transacción no puede asociarse a cuenta y tarjeta al mismo tiempo");
    }

    const user = await getCurrentUser(ctx);

    // Rate limiting: máximo 30 modificaciones por minuto por usuario
    const latestTxsUpdate = await ctx.db
      .query("transactions")
      .withIndex("by_user", (q) => q.eq("userId", user.clerkId))
      .order("desc")
      .take(31);
    if (latestTxsUpdate.filter((t) => t.createdAt >= Date.now() - 60_000).length >= 30) {
      throw new Error("Demasiadas operaciones en poco tiempo. Intenta de nuevo en un minuto.");
    }

    const tx = await ctx.db.get(transactionId);
    if (!tx || tx.userId !== user.clerkId) throw new Error("Transacción no encontrada");

    // Transferencias: solo se permite editar descripción y notas
    if (tx.type === "transferencia") {
      if (fields.amount !== undefined || fields.accountId !== undefined || fields.cardId !== undefined || fields.date !== undefined) {
        throw new Error("En una transferencia solo se pueden editar la descripción y las notas. Elimínala y créala de nuevo si hay errores en los datos principales.");
      }
      const patch: Record<string, unknown> = { updatedAt: Date.now() };
      if (fields.description !== undefined) patch.description = fields.description;
      if (fields.notes !== undefined) patch.notes = fields.notes;
      await ctx.db.patch(transactionId, patch);
      // Si hay pierna hermana, actualizarla también
      if (tx.transferGroupId) {
        const txs = await ctx.db
          .query("transactions")
          .withIndex("by_transfer_group", (q) => q.eq("transferGroupId", tx.transferGroupId))
          .collect();
        for (const sibling of txs) {
          if (sibling._id !== transactionId) {
            const siblingPatch: Record<string, unknown> = { updatedAt: Date.now() };
            if (fields.description !== undefined) siblingPatch.description = fields.description;
            if (fields.notes !== undefined) siblingPatch.notes = fields.notes;
            await ctx.db.patch(sibling._id, siblingPatch);
          }
        }
      }
      return;
    }

    // gasto_tarjeta vinculado a cuota: solo editar descripción, categoría y notas
    if (tx.type === "gasto_tarjeta" && tx.cardInstallmentId) {
      if (fields.amount !== undefined || fields.accountId !== undefined || fields.cardId !== undefined || fields.date !== undefined) {
        throw new Error("Los gastos con tarjeta vinculados a una cuota solo permiten editar la descripción, categoría y notas. Para cambiar datos financieros, edita la compra directamente.");
      }
    }

    // Derivar nueva fuente (exclusión mutua: si llega uno, el otro se borra)
    const changingToAccount = fields.accountId !== undefined;
    const changingToCard    = fields.cardId    !== undefined;
    const newAccountId = changingToAccount ? fields.accountId
                       : changingToCard    ? undefined
                       : tx.accountId;
    const newCardId    = changingToCard    ? fields.cardId
                       : changingToAccount ? undefined
                       : tx.cardId;

    // Validar currency de la nueva fuente
    if (newAccountId && newAccountId !== tx.accountId) {
      const acct = await ctx.db.get(newAccountId);
      if (!acct) throw new Error("Cuenta no encontrada");
      if (acct.currency !== tx.currency) {
        throw new Error(`La cuenta "${acct.name}" usa ${acct.currency} pero la transacción es en ${tx.currency}`);
      }
      await assertCanWrite(ctx, newAccountId);
    }
    if (newCardId && newCardId !== tx.cardId) {
      const card = await ctx.db.get(newCardId);
      if (!card || card.userId !== user.clerkId) throw new Error("Tarjeta no encontrada");
      if (card.currency !== tx.currency) {
        throw new Error(`La tarjeta "${card.name}" usa ${card.currency} pero la transacción es en ${tx.currency}`);
      }
    }

    const newAmount   = fields.amount      ?? tx.amount;
    const newMonth    = fields.date        ? toMonthString(fields.date) : tx.month;
    const newCategory = fields.categoryId !== undefined ? fields.categoryId : tx.categoryId;

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (fields.description !== undefined) patch.description = fields.description;
    if (fields.categoryId  !== undefined) patch.categoryId  = fields.categoryId;
    if (fields.notes       !== undefined) patch.notes       = fields.notes;
    if (fields.tags        !== undefined) patch.tags        = fields.tags;
    if (fields.amount      !== undefined) patch.amount      = fields.amount;
    if (fields.date        !== undefined) { patch.date = fields.date; patch.month = newMonth; }
    if (changingToAccount) { patch.accountId = newAccountId; patch.cardId = undefined; }
    if (changingToCard)    { patch.cardId    = newCardId;    patch.accountId = undefined; }

    // Ajustar saldos con patrón revert+apply (cubre cambio de fuente, monto, o ambos)
    const sourceChanged = newAccountId !== tx.accountId || newCardId !== tx.cardId;
    const amountChanged = newAmount !== tx.amount;

    if (sourceChanged || amountChanged) {
      // ingreso y prestamo_cobrado son créditos (el dinero entró a la cuenta)
      const isCreditType = tx.type === "ingreso" || tx.type === "prestamo_cobrado";

      // Revertir impacto en fuente vieja
      if (tx.accountId) {
        await applyAccountDelta(ctx, tx.accountId, isCreditType ? -tx.amount : tx.amount);
      }
      if (tx.cardId && tx.type === "gasto") {
        await applyCardDelta(ctx, tx.cardId, -tx.amount);
      }
      // Aplicar impacto en fuente nueva
      if (newAccountId) {
        await applyAccountDelta(ctx, newAccountId, isCreditType ? newAmount : -newAmount);
      }
      if (newCardId && tx.type === "gasto") {
        await applyCardDelta(ctx, newCardId, newAmount);
      }
    }

    // Recalcular budget.spent: revertir vieja contribución y aplicar nueva
    if (tx.type === "gasto" || tx.type === "gasto_tarjeta") {
      const categoryChanged = newCategory !== tx.categoryId;
      const monthChanged    = newMonth    !== tx.month;

      if (amountChanged || categoryChanged || monthChanged) {
        if (tx.categoryId) {
          await applyBudgetDelta(ctx, tx.userId, tx.categoryId, tx.month, -tx.amount, tx.currency);
        }
        if (newCategory) {
          await applyBudgetDelta(ctx, tx.userId, newCategory, newMonth, newAmount, tx.currency);
        }
      }
    }

    // Para gasto_tarjeta: también ajustar card.currentBalance si cambió el monto
    if (tx.type === "gasto_tarjeta" && tx.cardId && amountChanged) {
      const diff = newAmount - tx.amount;
      await applyCardDelta(ctx, tx.cardId, diff);
    }

    // Sincronizar meta de ahorro si cambió el monto de un gasto vinculado
    if (tx.type === "gasto" && tx.goalId && amountChanged) {
      await applyGoalDelta(ctx, tx.goalId, newAmount - tx.amount);
    }

    await ctx.db.patch(transactionId, patch);
  },
});

export const remove = mutation({
  args: { transactionId: v.id("transactions") },
  handler: async (ctx, { transactionId }) => {
    const user = await getCurrentUser(ctx);

    // Rate limiting: máximo 30 eliminaciones por minuto por usuario
    const latestTxsRemove = await ctx.db
      .query("transactions")
      .withIndex("by_user", (q) => q.eq("userId", user.clerkId))
      .order("desc")
      .take(31);
    if (latestTxsRemove.filter((t) => t.createdAt >= Date.now() - 60_000).length >= 30) {
      throw new Error("Demasiadas operaciones en poco tiempo. Intenta de nuevo en un minuto.");
    }

    const tx = await ctx.db.get(transactionId);
    if (!tx || tx.userId !== user.clerkId) {
      throw new Error("Transacción no encontrada");
    }
    // Los ajustes de saldo son inmutables: si el usuario quiere "deshacer" un
    // ajuste, debe crear otra reasignación. El delta original no está preservado
    // en el registro, por lo que no es posible revertirlo con seguridad.
    if (tx.type === "ajuste") {
      throw new Error("No se puede eliminar una reasignación. Crea una nueva reasignación si necesitas corregir el saldo.");
    }
    await deleteTransactionWithEffects(ctx, tx);
  },
});

// ─── Transferencia — doble entrada ───────────────────────────────────────────
//
// Genera dos transactions enlazadas por transferGroupId:
//   - Salida: type="transferencia", accountId=fromAccountId, amount=-X
//   - Entrada: type="transferencia", accountId=toAccountId,  amount=+Y
// Si las monedas difieren, toAmount usa la tasa provista.

export const createTransfer = mutation({
  args: {
    fromAccountId: v.id("accounts"),
    toAccountId: v.id("accounts"),
    amount: v.number(),          // en centavos, moneda de la cuenta origen
    date: v.number(),
    description: v.string(),
    exchangeRate: v.optional(v.number()), // requerido si las monedas difieren
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.amount <= 0 || !Number.isFinite(args.amount)) throw new Error("El monto debe ser mayor que cero");
    if (args.amount > 9_999_999_999) throw new Error("Monto fuera de rango permitido");
    if (args.description.length === 0 || args.description.length > 200) throw new Error("La descripción debe tener entre 1 y 200 caracteres");
    if (args.notes !== undefined && args.notes.length > 500) throw new Error("Las notas no pueden superar 500 caracteres");

    const user = await getCurrentUser(ctx);

    // Rate limiting: máximo 30 transferencias por minuto por usuario
    const latestTxsTransfer = await ctx.db
      .query("transactions")
      .withIndex("by_user", (q) => q.eq("userId", user.clerkId))
      .order("desc")
      .take(31);
    if (latestTxsTransfer.filter((t) => t.createdAt >= Date.now() - 60_000).length >= 30) {
      throw new Error("Demasiadas operaciones en poco tiempo. Intenta de nuevo en un minuto.");
    }

    // Verificar permisos en ambas cuentas
    await assertCanWrite(ctx, args.fromAccountId);
    await assertCanWrite(ctx, args.toAccountId);

    const fromAccount = await ctx.db.get(args.fromAccountId);
    const toAccount = await ctx.db.get(args.toAccountId);
    if (!fromAccount || !toAccount) throw new Error("Cuenta no encontrada");
    if (args.fromAccountId === args.toAccountId) {
      throw new Error("Las cuentas origen y destino deben ser distintas");
    }

    const sameCurrency = fromAccount.currency === toAccount.currency;
    if (!sameCurrency && !args.exchangeRate) {
      throw new Error(
        "Debes proporcionar la tasa de cambio para transferir entre cuentas con distinta moneda"
      );
    }
    // Rechazar tasas fuera de rango para prevenir montos resultantes astronómicos o negativos
    if (
      args.exchangeRate !== undefined &&
      (args.exchangeRate <= 0 || !Number.isFinite(args.exchangeRate) || args.exchangeRate > 10_000_000)
    ) {
      throw new Error("La tasa de cambio debe ser un número positivo (máx. 10.000.000)");
    }

    const toAmount = sameCurrency
      ? args.amount
      : Math.round(args.amount * args.exchangeRate!);

    const transferGroupId = generateId();
    const month = toMonthString(args.date);
    const now = Date.now();

    // Transacción de salida (cuenta origen)
    const outTxId = await ctx.db.insert("transactions", {
      userId: user.clerkId,
      type: "transferencia",
      amount: args.amount,
      description: args.description,
      date: args.date,
      month,
      currency: fromAccount.currency,
      accountId: args.fromAccountId,
      toAccountId: args.toAccountId,
      transferGroupId,
      transferDirection: "out",
      exchangeRate: args.exchangeRate,
      toAmount,
      toCurrency: toAccount.currency,
      notes: args.notes,
      status: "completada",
      isRecurring: false,
      createdAt: now,
      updatedAt: now,
    });

    // Transacción de entrada (cuenta destino)
    await ctx.db.insert("transactions", {
      userId: user.clerkId,
      type: "transferencia",
      amount: toAmount,
      description: args.description,
      date: args.date,
      month,
      currency: toAccount.currency,
      accountId: args.toAccountId,
      toAccountId: args.fromAccountId,
      transferGroupId,
      transferDirection: "in",
      exchangeRate: args.exchangeRate ? 1 / args.exchangeRate : undefined,
      toAmount: args.amount,
      toCurrency: fromAccount.currency,
      notes: args.notes,
      status: "completada",
      isRecurring: false,
      createdAt: now,
      updatedAt: now,
    });

    // Actualizar saldos
    await applyAccountDelta(ctx, args.fromAccountId, -args.amount);
    await applyAccountDelta(ctx, args.toAccountId, toAmount);

    // Auto-completar metas vinculadas a la cuenta destino si se alcanza el objetivo
    if (toAccount.type === "ahorros") {
      await ctx.runMutation(internal.goals.checkLinkedGoalCompletion, { accountId: args.toAccountId });
    }

    return { transferGroupId, outTxId };
  },
});

/** Interna: consulta recurrentes que vencen ahora. */
export const listDueRecurring = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    return await ctx.db
      .query("recurringTransactions")
      .withIndex("by_next_occurrence", (q) => q.lte("nextOccurrence", now))
      .filter((q) => q.eq(q.field("active"), true))
      .collect();
  },
});

/** Interna: verifica si el usuario tiene al menos una transacción desde `sinceTs`. */
export const hadTransactionsToday = internalQuery({
  args: { userId: v.string(), sinceTs: v.number() },
  handler: async (ctx, { userId, sinceTs }) => {
    const tx = await ctx.db
      .query("transactions")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("date", sinceTs))
      .take(1);
    return tx.length > 0;
  },
});

/** Interna: cuenta ingresos y gastos de un usuario en un rango de fechas. */
export const getSummaryForPeriod = internalQuery({
  args: { userId: v.string(), sinceTs: v.number() },
  handler: async (ctx, { userId, sinceTs }) => {
    const txs = await ctx.db
      .query("transactions")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("date", sinceTs))
      .take(500);
    const ingresos = txs.filter((t) => t.type === "ingreso").length;
    const gastos   = txs.filter((t) => t.type === "gasto").length;
    return { ingresos, gastos, total: txs.length };
  },
});

/** Interna: actualiza nextOccurrence tras generar la transacción. */
export const updateNextOccurrence = internalMutation({
  args: {
    recurringId: v.id("recurringTransactions"),
    nextOccurrence: v.number(),
  },
  handler: async (ctx, { recurringId, nextOccurrence }) => {
    await ctx.db.patch(recurringId, { nextOccurrence, updatedAt: Date.now() });
  },
});

/**
 * Interna: crea la transacción de una ocurrencia recurrente Y avanza nextOccurrence
 * en una única mutación atómica. Si el proceso falla después de crear la tx, la
 * próxima ejecución del cron encontrará nextOccurrence sin actualizar y volvería a
 * crear un duplicado — esta función elimina esa ventana de fallo al hacer ambas
 * operaciones indivisibles.
 */
export const processRecurringOccurrence = internalMutation({
  args: {
    userId: v.string(),
    type: v.union(
      v.literal("ingreso"),
      v.literal("gasto"),
      v.literal("pago_tarjeta"),
      v.literal("pago_deuda")
    ),
    amount: v.number(),
    description: v.string(),
    date: v.number(),
    currency: v.string(),
    accountId: v.optional(v.id("accounts")),
    cardId: v.optional(v.id("cards")),
    categoryId: v.optional(v.id("categories")),
    recurringId: v.id("recurringTransactions"),
    nextOccurrence: v.number(),
  },
  handler: async (ctx, args) => {
    const { recurringId, nextOccurrence, ...txArgs } = args;
    const month = toMonthString(txArgs.date);
    const now = Date.now();

    await ctx.db.insert("transactions", {
      userId: txArgs.userId,
      type: txArgs.type,
      amount: txArgs.amount,
      description: txArgs.description,
      date: txArgs.date,
      month,
      currency: txArgs.currency,
      accountId: txArgs.accountId,
      cardId: txArgs.cardId,
      categoryId: txArgs.categoryId,
      status: "completada",
      isRecurring: true,
      recurringId,
      createdAt: now,
      updatedAt: now,
    });

    // Usar el helper centralizado: garantiza consistencia y lanza error si la cuenta no existe,
    // lo que hace que el cron omita la tx entera (rollback atómico) en lugar de crear un orphan.
    if (txArgs.accountId) {
      const delta = txArgs.type === "ingreso" ? txArgs.amount : -txArgs.amount;
      await applyAccountDelta(ctx, txArgs.accountId, delta);
    }

    if (txArgs.type === "gasto" && txArgs.categoryId) {
      await applyBudgetDelta(ctx, txArgs.userId, txArgs.categoryId, month, txArgs.amount, txArgs.currency);
    }

    await ctx.db.patch(recurringId, { nextOccurrence, updatedAt: now });
  },
});
