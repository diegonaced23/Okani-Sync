import { query, mutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser, getCurrentUserId } from "./lib/auth";
import { assertIsOwner } from "./lib/permissions";
import { toMonthString, assertValidMonth } from "./lib/utils";
import { deleteTransactionWithEffects } from "./lib/transactionEffects";
import { convertAmount, getUserRateMap } from "./lib/money";

// Debe reflejar las keys de ACCOUNT_GRADIENTS en src/lib/constants.ts — el color de una cuenta
// no es un hex, es la key de un gradiente predefinido.
const ACCOUNT_GRADIENT_KEYS = new Set([
  "g-night", "g-red", "g-ember", "g-lime", "g-ocean", "g-violet", "g-rose", "g-gold",
]);

// ─── Helpers internos ─────────────────────────────────────────────────────────

/**
 * Devuelve cuentas propias (no archivadas) + cuentas compartidas aceptadas,
 * filtradas por `includeInBalance !== false`. Centraliza la lógica que antes
 * se repetía en consolidatedBalance, netWorth y financialHealthMetrics.
 */
async function getAccountsWithShared(ctx: QueryCtx, clerkId: string) {
  const [ownAccounts, shares] = await Promise.all([
    ctx.db
      .query("accounts")
      .withIndex("by_owner_archived", (q) => q.eq("ownerId", clerkId).eq("archived", false))
      .collect(),
    ctx.db
      .query("accountShares")
      .withIndex("by_shared_user_status", (q) =>
        q.eq("sharedWithUserId", clerkId).eq("status", "aceptada")
      )
      .collect(),
  ]);
  const sharedRaw = await Promise.all(shares.map((s) => ctx.db.get(s.accountId)));
  // Excluir archivadas — las propias ya filtran por archived=false en el índice
  const sharedAccounts = sharedRaw.filter(
    (a): a is NonNullable<typeof a> => a !== null && !a.archived
  );
  return [...ownAccounts, ...sharedAccounts].filter((a) => a.includeInBalance !== false);
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Balance consolidado en la moneda preferida del usuario.
 * Convierte cada cuenta usando currentExchangeRates.
 * Si no hay tasa para un par → suma el balance sin convertir y marca como "sin tasa".
 */
export const consolidatedBalance = query({
  args: {},
  handler: async (ctx) => {
    // getCurrentUser verifica JWT + existencia + user.active (bloquea cuentas desactivadas)
    const user = await getCurrentUser(ctx);
    const clerkId = user.clerkId;
    const preferredCurrency = user.currency ?? "COP";

    const [includedAccounts, currentRates] = await Promise.all([
      getAccountsWithShared(ctx, clerkId),
      ctx.db.query("currentExchangeRates").collect(),
    ]);
    const rateMap = new Map(
      currentRates.map((r) => [`${r.fromCurrency}→${r.toCurrency}`, r.rate])
    );

    function convert(amount: number, fromCurrency: string): { converted: number; hasRate: boolean } {
      if (fromCurrency === preferredCurrency) return { converted: amount, hasRate: true };
      const rate = rateMap.get(`${fromCurrency}→${preferredCurrency}`);
      if (!rate) return { converted: amount, hasRate: false };
      return { converted: Math.round(amount * rate), hasRate: true };
    }

    let total = 0;
    const missingRates: string[] = [];

    for (const account of includedAccounts) {
      const { converted, hasRate } = convert(account.balance, account.currency);
      total += converted;
      if (!hasRate && account.currency !== preferredCurrency) {
        missingRates.push(account.currency);
      }
    }

    return {
      total,
      currency: preferredCurrency,
      missingRates: [...new Set(missingRates)],
      accountCount: includedAccounts.length,
    };
  },
});

/**
 * Patrimonio neto real: Activos (cuentas) + Préstamos otorgados − Deuda de tarjetas − Otras deudas.
 * Usa exactamente el mismo scope de cuentas que `consolidatedBalance` para que ambas cifras
 * sean coherentes cuando se muestran juntas en el dashboard.
 * Monedas diferentes se convierten usando las tasas actuales; las tasas faltantes se
 * incluyen en `missingRates` para que la UI advierta al usuario.
 */
export const netWorth = query({
  args: {},
  handler: async (ctx) => {
    // getCurrentUser verifica JWT + existencia + user.active (bloquea cuentas desactivadas)
    const user = await getCurrentUser(ctx);
    const clerkId = user.clerkId;
    const { rateMap, preferredCurrency } = await getUserRateMap(ctx, user);
    const missingRateSet = new Set<string>();

    function convert(amountCents: number, fromCurrency: string) {
      const { converted, hasRate } = convertAmount(amountCents, fromCurrency, preferredCurrency, rateMap);
      if (!hasRate && fromCurrency !== preferredCurrency) {
        missingRateSet.add(fromCurrency);
        return 0; // sin tasa: se excluye del total en vez de sumar el monto crudo sin convertir
      }
      return converted;
    }

    // ── Activos: cuentas propias + cuentas compartidas aceptadas ──
    const allAccounts = await getAccountsWithShared(ctx, clerkId);
    const totalAssets = allAccounts.reduce((s, a) => s + convert(a.balance, a.currency), 0);
    const accountCount = allAccounts.length;

    // ── Pasivos: deuda de tarjetas (no archivadas) ──
    const cards = await ctx.db
      .query("cards")
      .withIndex("by_user_archived", (q) => q.eq("userId", clerkId).eq("archived", false))
      .collect();
    const totalCardDebt = cards.reduce((s, c) => s + convert(c.currentBalance, c.currency), 0);

    // ── Pasivos: deudas personales activas (no pagadas ni vencidas ya cubiertas) ──
    const debts = await ctx.db
      .query("debts")
      .withIndex("by_user_status", (q) => q.eq("userId", clerkId).eq("status", "activa"))
      .collect();
    // Las deudas vencidas también son pasivos reales — incluirlas
    const debtsVencidas = await ctx.db
      .query("debts")
      .withIndex("by_user_status", (q) => q.eq("userId", clerkId).eq("status", "vencida"))
      .collect();
    const totalDebt = [...debts, ...debtsVencidas].reduce(
      (s, d) => s + convert(d.currentBalance, d.currency),
      0
    );

    // ── Activos: préstamos otorgados activos (saldo pendiente de cobro) ──
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_user_status", (q) => q.eq("userId", clerkId).eq("status", "activa"))
      .collect();
    const loansVencidos = await ctx.db
      .query("loans")
      .withIndex("by_user_status", (q) => q.eq("userId", clerkId).eq("status", "vencida"))
      .collect();
    const totalLoansReceivable = [...loans, ...loansVencidos].reduce(
      (s, l) => s + convert(l.currentBalance, l.currency),
      0
    );

    const netWorthValue = totalAssets + totalLoansReceivable - totalCardDebt - totalDebt;

    return {
      netWorth: netWorthValue,
      totalAssets,
      totalCardDebt,
      totalDebt,
      totalLoansReceivable,
      currency: preferredCurrency,
      missingRates: [...missingRateSet],
      accountCount,
    };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await getCurrentUserId(ctx);
    return await ctx.db
      .query("accounts")
      .withIndex("by_owner_archived", (q) =>
        q.eq("ownerId", clerkId).eq("archived", false)
      )
      .collect();
  },
});

/**
 * Cuatro indicadores de salud financiera calculados sobre datos reales del usuario.
 *
 * Todos los importes usan la misma lógica de conversión que `monthlySummary` (2.2)
 * y `netWorth` (2.1) para que los números sean coherentes entre sí en el dashboard.
 *
 * - `savingsRate`: (ingresos − gastos) / ingresos del mes anterior completado.
 * - `dti`: (cuotas de tarjeta del mes + pagos mensuales de deuda) / ingresos.
 *   Solo incluye deudas que tienen `monthlyPayment` definido.
 * - `creditUtilization`: Σ currentBalance / Σ creditLimit (convertido por tarjeta).
 *   Excluye tarjetas con creditLimit = 0.
 * - `emergencyRunway`: activos totales / gasto promedio mensual (últimos 3 meses con datos).
 */
export const financialHealthMetrics = query({
  args: {},
  handler: async (ctx) => {
    // getCurrentUser verifica JWT + existencia + user.active (bloquea cuentas desactivadas)
    const user = await getCurrentUser(ctx);
    const clerkId = user.clerkId;
    const { rateMap, preferredCurrency } = await getUserRateMap(ctx, user);
    const missingRateSet = new Set<string>();

    const now = Date.now();
    const d = new Date(now);

    function prevNMonth(n: number): string {
      const t = new Date(d.getFullYear(), d.getMonth() - n, 1);
      return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
    }
    function currentMonthStr(): string {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }

    function convert(amountCents: number, fromCurrency: string): number {
      const { converted, hasRate } = convertAmount(amountCents, fromCurrency, preferredCurrency, rateMap);
      if (!hasRate && fromCurrency !== preferredCurrency) {
        missingRateSet.add(fromCurrency);
        return 0; // sin tasa: se excluye del total en vez de sumar el monto crudo sin convertir
      }
      return converted;
    }

    // ── Cuentas de tipo "ahorros" — usadas para detectar transferencias de ahorro ──
    const savingsAcctsForMetrics = await ctx.db
      .query("accounts")
      .withIndex("by_owner_type", (q) => q.eq("ownerId", clerkId).eq("type", "ahorros"))
      .collect();
    const savingsAccountIdsForMetrics = new Set(savingsAcctsForMetrics.map((a) => a._id));

    // ── Totales mensuales (ingresos / gastos / ahorros) — misma definición que monthlySummary ──
    // Usamos los últimos 3 meses completos; el mes en curso está parcialmente lleno.
    const last3Months = [prevNMonth(3), prevNMonth(2), prevNMonth(1)];
    const monthlyTotals = await Promise.all(
      last3Months.map(async (month) => {
        const txs = await ctx.db
          .query("transactions")
          .withIndex("by_user_month", (q) => q.eq("userId", clerkId).eq("month", month))
          .collect();
        const ingresos = txs
          .filter((t) => t.type === "ingreso")
          .reduce((s, t) => s + convert(t.amount, t.currency), 0);
        const gastos = txs
          .filter((t) => t.type === "gasto" || t.type === "gasto_tarjeta" || t.type === "pago_deuda")
          .reduce((s, t) => s + convert(t.amount, t.currency), 0);
        // Ahorros = transferencias OUT a cuentas de ahorro + gastos vinculados a meta
        const ahorros = txs
          .filter((t) =>
            (t.type === "transferencia" && t.transferDirection === "out" &&
              t.toAccountId !== undefined && savingsAccountIdsForMetrics.has(t.toAccountId)) ||
            (t.type === "gasto" && t.goalId !== undefined)
          )
          .reduce((s, t) => s + convert(t.amount, t.currency), 0);
        return { month, ingresos, gastos, ahorros, hasData: txs.length > 0 };
      })
    );

    // Mes inmediatamente anterior = referencia primaria para tasa de ahorro y DTI
    const lastMonth = monthlyTotals[2]; // prevNMonth(1)

    // ── Tasa de ahorro — ahorro intencional (transferencias a cuentas de ahorro + gastos a meta) ──
    const savingsRate = lastMonth.ingresos > 0 && lastMonth.ahorros > 0
      ? (lastMonth.ahorros / lastMonth.ingresos) * 100
      : lastMonth.ingresos > 0
        ? 0
        : null;

    // ── Tarjetas del usuario — se necesitan para convertir cuotas y utilización por su moneda real ──
    const allCards = await ctx.db
      .query("cards")
      .withIndex("by_user_archived", (q) => q.eq("userId", clerkId).eq("archived", false))
      .collect();
    const cardMap = new Map(allCards.map((c) => [c._id.toString(), c]));

    // ── DTI — solo deudas con monthlyPayment definido ─────────────────────────
    // Cuotas de tarjeta del mes en curso. Se convierten por la moneda real de cada tarjeta
    // (igual que creditUtilization), en vez de asumir la moneda preferida del usuario.
    const cardInstallmentsNow = await ctx.db
      .query("cardInstallments")
      .withIndex("by_user_month", (q) => q.eq("userId", clerkId).eq("month", currentMonthStr()))
      .collect();
    const monthlyCardCommitment = cardInstallmentsNow
      .filter((i) => !i.paid)
      .reduce((s, i) => {
        const card = cardMap.get(i.cardId.toString());
        return s + convert(i.amount, card?.currency ?? preferredCurrency);
      }, 0);

    const activeDebts = await ctx.db
      .query("debts")
      .withIndex("by_user_status", (q) => q.eq("userId", clerkId).eq("status", "activa"))
      .collect();
    const monthlyDebtPayments = activeDebts
      .filter((d) => d.monthlyPayment !== undefined && d.monthlyPayment > 0)
      .reduce((s, debt) => s + convert(debt.monthlyPayment!, debt.currency), 0);

    const totalMonthlyCommitments = monthlyCardCommitment + monthlyDebtPayments;
    const dti = lastMonth.ingresos > 0 && totalMonthlyCommitments > 0
      ? totalMonthlyCommitments / lastMonth.ingresos
      : null;
    const dtiIncomplete = activeDebts.some((d) => !d.monthlyPayment || d.monthlyPayment === 0);

    // ── Utilización de crédito — convertir por tarjeta antes de sumar ─────────
    let totalBalanceConverted = 0;
    let totalLimitConverted = 0;

    for (const card of allCards) {
      if (card.creditLimit <= 0) continue;
      const bal = convert(card.currentBalance, card.currency);
      const lim = convert(card.creditLimit, card.currency);
      totalBalanceConverted += bal;
      totalLimitConverted += lim;
    }

    const creditUtilization = totalLimitConverted > 0
      ? (totalBalanceConverted / totalLimitConverted) * 100
      : null;

    // ── Runway de emergencia ──────────────────────────────────────────────────
    // Activos: mismo scope que netWorth.totalAssets — centralizado en getAccountsWithShared.
    const allAccountsForRunway = await getAccountsWithShared(ctx, clerkId);
    const totalAssets = allAccountsForRunway.reduce(
      (s, a) => s + convert(a.balance, a.currency), 0
    );

    // Promedio de gastos: solo sobre los meses que tienen datos reales
    const monthsWithData = monthlyTotals.filter((m) => m.hasData);
    const avgMonthlyExpenses = monthsWithData.length > 0
      ? monthsWithData.reduce((s, m) => s + m.gastos, 0) / monthsWithData.length
      : 0;

    const emergencyRunway = avgMonthlyExpenses > 0
      ? totalAssets / avgMonthlyExpenses
      : null;

    return {
      savingsRate,
      dti,
      dtiIncomplete,
      creditUtilization,
      emergencyRunway,
      currency: preferredCurrency,
      missingRates: [...missingRateSet],
      // Datos de apoyo para posible desglose en UI
      lastMonthIncome: lastMonth.ingresos,
      lastMonthExpenses: lastMonth.gastos,
      totalAssets,
      avgMonthlyExpenses,
      totalMonthlyCommitments,
    };
  },
});

/**
 * Resumen de ahorro del mes: transferencias a cuentas de tipo "ahorros" +
 * gastos vinculados a metas. Usado por el widget SavingsCard del dashboard.
 */
export const monthlySavingsSummary = query({
  args: { month: v.string() },
  handler: async (ctx, { month }) => {
    assertValidMonth(month);
    const user = await getCurrentUser(ctx);
    const { rateMap, preferredCurrency } = await getUserRateMap(ctx, user);
    const missingRateSet = new Set<string>();

    function convert(amount: number, fromCurrency: string): number {
      const { converted, hasRate } = convertAmount(amount, fromCurrency, preferredCurrency, rateMap);
      if (!hasRate && fromCurrency !== preferredCurrency) {
        missingRateSet.add(fromCurrency);
        return 0; // sin tasa: se excluye del total en vez de sumar el monto crudo sin convertir
      }
      return converted;
    }

    // Cuentas de tipo "ahorros" del usuario
    const savingsAccounts = await ctx.db
      .query("accounts")
      .withIndex("by_owner_type", (q) => q.eq("ownerId", user.clerkId).eq("type", "ahorros"))
      .collect();
    const savingsAccountIds = new Set(savingsAccounts.map((a) => a._id));

    // Todas las transacciones del mes
    const txs = await ctx.db
      .query("transactions")
      .withIndex("by_user_month", (q) => q.eq("userId", user.clerkId).eq("month", month))
      .collect();

    // Transferencias OUT hacia cuentas de ahorro
    const transferenciasAhorro = txs
      .filter((t) =>
        t.type === "transferencia" &&
        t.transferDirection === "out" &&
        t.toAccountId !== undefined &&
        savingsAccountIds.has(t.toAccountId)
      )
      .reduce((s, t) => s + convert(t.amount, t.currency), 0);

    // Gastos vinculados a una meta (ahorro en efectivo / casa)
    const gastosMetaVinculada = txs
      .filter((t) => t.type === "gasto" && t.goalId !== undefined)
      .reduce((s, t) => s + convert(t.amount, t.currency), 0);

    // Ingresos del mes (para calcular tasa)
    const totalIngresos = txs
      .filter((t) => t.type === "ingreso")
      .reduce((s, t) => s + convert(t.amount, t.currency), 0);

    const totalAhorrado = transferenciasAhorro + gastosMetaVinculada;
    const tasaAhorro = totalIngresos > 0 ? (totalAhorrado / totalIngresos) * 100 : null;

    return {
      transferenciasAhorro,
      gastosMetaVinculada,
      totalAhorrado,
      tasaAhorro,
      totalIngresos,
      currency: preferredCurrency,
      missingRates: [...missingRateSet],
      cuentasAhorro: savingsAccounts.map((a) => ({
        id: a._id,
        name: a.name,
        balance: convert(a.balance, a.currency),
        currency: a.currency,
        color: a.color,
      })),
    };
  },
});

export const getById = query({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    const clerkId = await getCurrentUserId(ctx);
    const account = await ctx.db.get(accountId);
    if (!account) return null;
    if (account.ownerId === clerkId) return account;

    const share = await ctx.db
      .query("accountShares")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .filter((q) =>
        q.and(
          q.eq(q.field("sharedWithUserId"), clerkId),
          q.eq(q.field("status"), "aceptada")
        )
      )
      .unique();
    return share ? account : null;
  },
});

export const listSharedWithMe = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await getCurrentUserId(ctx);
    const shares = await ctx.db
      .query("accountShares")
      .withIndex("by_shared_user_status", (q) =>
        q.eq("sharedWithUserId", clerkId).eq("status", "aceptada")
      )
      .collect();
    const accounts = await Promise.all(shares.map((s) => ctx.db.get(s.accountId)));
    // Excluir archivadas — el gestor de shares las muestra, pero no el balance ni las listas activas.
    // Se proyecta un shape público: accountNumber/bankName ya se muestran enmascarados en la UI,
    // pero notes/ownerId/isDefault y demás campos internos del dueño no deben viajar a un colaborador.
    return accounts
      .filter((a): a is NonNullable<typeof a> => a !== null && !a.archived)
      .map((a) => ({
        _id: a._id,
        name: a.name,
        type: a.type,
        balance: a.balance,
        currency: a.currency,
        color: a.color,
        bankName: a.bankName,
        accountNumber: a.accountNumber,
      }));
  },
});

export const listPendingInvitations = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await getCurrentUserId(ctx);
    return await ctx.db
      .query("accountShares")
      .withIndex("by_shared_user_status", (q) =>
        q.eq("sharedWithUserId", clerkId).eq("status", "pendiente")
      )
      .collect();
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    name: v.string(),
    type: v.union(
      v.literal("billetera"),
      v.literal("bancaria"),
      v.literal("ahorros"),
      v.literal("inversion")
    ),
    bankName: v.optional(v.string()),
    accountNumber: v.optional(v.string()),
    initialBalance: v.number(), // en centavos
    currency: v.string(),
    color: v.string(),
    icon: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.name.length === 0 || args.name.length > 100) throw new Error("El nombre debe tener entre 1 y 100 caracteres");
    if (!Number.isFinite(args.initialBalance) || args.initialBalance < 0) throw new Error("El saldo inicial debe ser mayor o igual a cero");
    if (!/^[A-Za-z]{3}$/.test(args.currency)) throw new Error("Código de moneda inválido");
    if (!ACCOUNT_GRADIENT_KEYS.has(args.color)) throw new Error("Color de cuenta inválido");
    if (args.accountNumber !== undefined && !/^\d{0,4}$/.test(args.accountNumber)) throw new Error("El número de cuenta debe tener máximo 4 dígitos (los últimos de la cuenta real)");
    if (args.notes !== undefined && args.notes.length > 500) throw new Error("Las notas no pueden superar 500 caracteres");

    const user = await getCurrentUser(ctx);
    const now = Date.now();
    return await ctx.db.insert("accounts", {
      ownerId: user.clerkId,
      name: args.name,
      type: args.type,
      bankName: args.bankName,
      accountNumber: args.accountNumber,
      balance: args.initialBalance,
      initialBalance: args.initialBalance,
      currency: args.currency,
      color: args.color,
      icon: args.icon,
      isDefault: false,
      isShared: false,
      archived: false,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    accountId: v.id("accounts"),
    name: v.optional(v.string()),
    type: v.optional(v.union(
      v.literal("billetera"),
      v.literal("bancaria"),
      v.literal("ahorros"),
      v.literal("inversion")
    )),
    bankName: v.optional(v.string()),
    accountNumber: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { accountId, ...fields }) => {
    if (fields.name !== undefined && (fields.name.length === 0 || fields.name.length > 100)) throw new Error("El nombre debe tener entre 1 y 100 caracteres");
    if (fields.color !== undefined && !ACCOUNT_GRADIENT_KEYS.has(fields.color)) throw new Error("Color de cuenta inválido");
    if (fields.accountNumber !== undefined && !/^\d{0,4}$/.test(fields.accountNumber)) throw new Error("El número de cuenta debe tener máximo 4 dígitos (los últimos de la cuenta real)");
    if (fields.notes !== undefined && fields.notes.length > 500) throw new Error("Las notas no pueden superar 500 caracteres");

    const user = await getCurrentUser(ctx);
    const account = await ctx.db.get(accountId);
    if (!account || account.ownerId !== user.clerkId) {
      throw new Error("Cuenta no encontrada");
    }
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) patch[k] = v;
    }
    await ctx.db.patch(accountId, patch);
  },
});

/** Elimina la cuenta y todos sus registros asociados (cascade). */
export const remove = mutation({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    const user = await getCurrentUser(ctx);
    const account = await ctx.db.get(accountId);
    if (!account || account.ownerId !== user.clerkId) {
      throw new Error("Cuenta no encontrada");
    }

    // 1. Compartidos
    const shares = await ctx.db
      .query("accountShares")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .collect();
    for (const share of shares) {
      await ctx.db.delete(share._id);
    }

    // 2. Transacciones donde la cuenta es origen O destino.
    // Se revierten todos los efectos secundarios (presupuestos, deuda de tarjeta, saldos
    // de otras cuentas en transferencias) antes de eliminar cada registro.
    // Los transferGroupId se rastrean para no procesar ambas piernas del mismo par.
    const allTxs = await ctx.db
      .query("transactions")
      .withIndex("by_user", (q) => q.eq("userId", user.clerkId))
      .collect();
    const processedGroups = new Set<string>();
    for (const tx of allTxs) {
      if (tx.accountId !== accountId && tx.toAccountId !== accountId) continue;
      if (tx.transferGroupId) {
        if (processedGroups.has(tx.transferGroupId)) continue; // ya manejado por la otra pierna
        processedGroups.add(tx.transferGroupId);
      }
      await deleteTransactionWithEffects(ctx, tx);
    }

    // 3. Transacciones recurrentes que referencien esta cuenta
    const recurring = await ctx.db
      .query("recurringTransactions")
      .withIndex("by_user", (q) => q.eq("userId", user.clerkId))
      .collect();
    for (const rt of recurring) {
      if (rt.accountId === accountId) {
        await ctx.db.delete(rt._id);
      }
    }

    // 4. La cuenta
    await ctx.db.delete(accountId);
  },
});

export const archive = mutation({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    const user = await getCurrentUser(ctx);
    const account = await ctx.db.get(accountId);
    if (!account || account.ownerId !== user.clerkId) {
      throw new Error("Cuenta no encontrada");
    }
    if (account.isDefault) {
      throw new Error("No se puede archivar la cuenta por defecto");
    }
    await ctx.db.patch(accountId, { archived: true, updatedAt: Date.now() });
  },
});

/**
 * Reasigna el saldo actual de una cuenta. La diferencia entre el saldo nuevo y
 * el actual se registra como una transacción de tipo "ajuste" con descripción
 * "Reasignación bancaria" — visible en el historial pero excluida de los
 * resúmenes de ingresos/gastos.
 *
 * Solo el propietario puede ajustar el saldo (no editores ni admins de cuentas
 * compartidas). Convex serializa la mutación → no hay race entre lectura y
 * escritura del balance.
 */
export const reassignBalance = mutation({
  args: {
    accountId: v.id("accounts"),
    newBalance: v.number(), // en centavos, entero ≥ 0
  },
  handler: async (ctx, { accountId, newBalance }) => {
    if (!Number.isInteger(newBalance) || newBalance < 0) {
      throw new Error("El saldo debe ser un entero mayor o igual a cero");
    }
    if (newBalance > 9_999_999_999) {
      throw new Error("Saldo fuera de rango permitido");
    }

    await assertIsOwner(ctx, accountId);

    const user = await getCurrentUser(ctx);
    const account = await ctx.db.get(accountId);
    if (!account) throw new Error("Cuenta no encontrada");
    if (account.archived) throw new Error("No se puede ajustar una cuenta archivada");

    const previousBalance = account.balance;
    const delta = newBalance - previousBalance;

    if (delta === 0) {
      return { adjusted: false as const };
    }

    const now = Date.now();

    const txId = await ctx.db.insert("transactions", {
      userId: user.clerkId,
      type: "ajuste",
      amount: Math.abs(delta),
      description: "Reasignación bancaria",
      date: now,
      month: toMonthString(now),
      currency: account.currency,
      accountId,
      status: "completada",
      isRecurring: false,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(accountId, { balance: newBalance, updatedAt: now });

    await ctx.db.insert("auditLogs", {
      userId: user.clerkId,
      action: "account.balance.reassigned",
      entity: "account",
      entityId: accountId,
      metadata: { previousBalance, newBalance, delta, txId },
      createdAt: now,
    });

    return { adjusted: true as const, delta, txId };
  },
});

/** Retorna true si la cuenta tiene al menos una transacción registrada. */
export const hasTransactions = query({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    await assertIsOwner(ctx, accountId);
    const tx = await ctx.db
      .query("transactions")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .take(1);
    return tx.length > 0;
  },
});

/**
 * Corrige directamente el saldo de una cuenta sin transacciones.
 * Actualiza `balance` e `initialBalance` sin generar ningún registro.
 * Falla si la cuenta ya tiene transacciones — usar `reassignBalance` en ese caso.
 */
export const correctBalance = mutation({
  args: {
    accountId: v.id("accounts"),
    newBalance: v.number(),
  },
  handler: async (ctx, { accountId, newBalance }) => {
    if (!Number.isInteger(newBalance) || newBalance < 0) {
      throw new Error("El saldo debe ser un entero mayor o igual a cero");
    }
    if (newBalance > 9_999_999_999) {
      throw new Error("Saldo fuera de rango permitido");
    }

    await assertIsOwner(ctx, accountId);

    const user = await getCurrentUser(ctx);
    const account = await ctx.db.get(accountId);
    if (!account) throw new Error("Cuenta no encontrada");
    if (account.archived) throw new Error("No se puede corregir una cuenta archivada");

    const existingTx = await ctx.db
      .query("transactions")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .take(1);
    if (existingTx.length > 0) {
      throw new Error("La cuenta ya tiene transacciones — usá Ajustar saldo en su lugar");
    }

    const previousBalance = account.balance;
    if (newBalance === previousBalance) {
      return { corrected: false as const };
    }

    const now = Date.now();
    await ctx.db.patch(accountId, { balance: newBalance, initialBalance: newBalance, updatedAt: now });

    await ctx.db.insert("auditLogs", {
      userId: user.clerkId,
      action: "account.balance.corrected",
      entity: "account",
      entityId: accountId,
      metadata: { previousBalance, newBalance },
      createdAt: now,
    });

    return { corrected: true as const };
  },
});

// Incluye o excluye una cuenta propia del cálculo de patrimonio total.
// Las cuentas compartidas no son modificables por el que las recibe.
export const toggleBalanceInclusion = mutation({
  args: {
    accountId: v.id("accounts"),
    include: v.boolean(),
  },
  handler: async (ctx, { accountId, include }) => {
    const user = await getCurrentUser(ctx);
    const account = await ctx.db.get(accountId);
    if (!account || account.ownerId !== user.clerkId) {
      throw new Error("Cuenta no encontrada");
    }
    await ctx.db.patch(accountId, {
      includeInBalance: include,
      updatedAt: Date.now(),
    });
  },
});
