import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getCurrentUser, getCurrentUserId } from "./lib/auth";
import { assertCanRead, assertCanWrite } from "./lib/permissions";
import { toMonthString, generateId } from "./lib/utils";

// ─── Helpers internos ─────────────────────────────────────────────────────────

async function applyAccountDelta(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  delta: number
) {
  const account = await ctx.db.get(accountId);
  if (!account) throw new Error("Cuenta no encontrada");
  await ctx.db.patch(accountId, {
    balance: account.balance + delta,
    updatedAt: Date.now(),
  });
}

async function applyCardDelta(
  ctx: MutationCtx,
  cardId: Id<"cards">,
  delta: number  // positivo = más gasto, negativo = reversión
) {
  const card = await ctx.db.get(cardId);
  if (!card) throw new Error("Tarjeta no encontrada");
  const newBalance = card.currentBalance + delta;
  await ctx.db.patch(cardId, {
    currentBalance: newBalance,
    availableCredit: card.creditLimit - newBalance,
    updatedAt: Date.now(),
  });
}

async function applyBudgetDelta(
  ctx: MutationCtx,
  userId: string,
  categoryId: Id<"categories">,
  month: string,
  delta: number
) {
  const budget = await ctx.db
    .query("budgets")
    .withIndex("by_user_category_month", (q) =>
      q.eq("userId", userId).eq("categoryId", categoryId).eq("month", month)
    )
    .unique();
  if (!budget) return;
  await ctx.db.patch(budget._id, {
    spent: Math.max(0, budget.spent + delta),
    updatedAt: Date.now(),
  });
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export const listByMonth = query({
  args: { month: v.string() },
  handler: async (ctx, { month }) => {
    const clerkId = await getCurrentUserId(ctx);
    return await ctx.db
      .query("transactions")
      .withIndex("by_user_month", (q) =>
        q.eq("userId", clerkId).eq("month", month)
      )
      .order("desc")
      .collect();
  },
});

export const listByAccountMonth = query({
  args: { accountId: v.id("accounts"), month: v.string() },
  handler: async (ctx, { accountId, month }) => {
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
    return await ctx.db
      .query("transactions")
      .withIndex("by_user_date", (q) => q.eq("userId", clerkId))
      .order("desc")
      .take(safeLimit);
  },
});

export const getById = query({
  args: { transactionId: v.id("transactions") },
  handler: async (ctx, { transactionId }) => {
    const clerkId = await getCurrentUserId(ctx);
    const tx = await ctx.db.get(transactionId);
    if (!tx || tx.userId !== clerkId) return null;
    return tx;
  },
});

/** Gastos del mes agrupados por categoría — para el gráfico Pie del dashboard. */
export const spendingByCategory = query({
  args: { month: v.string() },
  handler: async (ctx, { month }) => {
    const clerkId = await getCurrentUserId(ctx);
    const txs = await ctx.db
      .query("transactions")
      .withIndex("by_user_type_month", (q) =>
        q.eq("userId", clerkId).eq("type", "gasto").eq("month", month)
      )
      .collect();

    const grouped = new Map<string, { amount: number; categoryId: string | null }>();
    for (const tx of txs) {
      const key = tx.categoryId ?? "__none__";
      const existing = grouped.get(key);
      if (existing) {
        existing.amount += tx.amount;
      } else {
        grouped.set(key, { amount: tx.amount, categoryId: tx.categoryId ?? null });
      }
    }

    return await Promise.all(
      [...grouped.entries()].map(async ([key, data]) => {
        if (key === "__none__" || !data.categoryId) {
          return { name: "Sin categoría", amount: data.amount, color: "#6B7280" };
        }
        const cat = await ctx.db.get(data.categoryId as Id<"categories">);
        return {
          name: cat?.name ?? "Sin categoría",
          amount: data.amount,
          color: cat?.color ?? "#6B7280",
        };
      })
    ).then((items) => items.sort((a, b) => b.amount - a.amount));
  },
});

/** Gastos del mes agrupados por cuenta o tarjeta — para el gráfico de barras del dashboard. */
export const spendingBySource = query({
  args: { month: v.string() },
  handler: async (ctx, { month }) => {
    const clerkId = await getCurrentUserId(ctx);
    const txs = await ctx.db
      .query("transactions")
      .withIndex("by_user_type_month", (q) =>
        q.eq("userId", clerkId).eq("type", "gasto").eq("month", month)
      )
      .collect();

    // Agrupa por accountId o cardId
    const grouped = new Map<string, {
      amount: number;
      sourceId: string | null;
      sourceType: "account" | "card" | "none";
    }>();

    for (const tx of txs) {
      const key = tx.accountId ?? tx.cardId ?? "__none__";
      const sourceType = tx.accountId ? "account" : tx.cardId ? "card" : "none";
      const existing = grouped.get(key);
      if (existing) {
        existing.amount += tx.amount;
      } else {
        grouped.set(key, {
          amount: tx.amount,
          sourceId: (tx.accountId ?? tx.cardId) ?? null,
          sourceType,
        });
      }
    }

    const results = await Promise.all(
      [...grouped.entries()].map(async ([key, data]) => {
        if (key === "__none__") {
          return { name: "Sin fuente", amount: data.amount, color: "#6B7280" };
        }
        if (data.sourceType === "account") {
          const acc = await ctx.db.get(data.sourceId as Id<"accounts">);
          return {
            name: acc?.name ?? "Cuenta eliminada",
            amount: data.amount,
            color: acc?.color ?? "#6B7280",
          };
        }
        const card = await ctx.db.get(data.sourceId as Id<"cards">);
        return {
          name: card ? `${card.name} ····${card.lastFourDigits}` : "Tarjeta eliminada",
          amount: data.amount,
          color: card?.color ?? "#6B7280",
        };
      })
    );

    return results.sort((a, b) => b.amount - a.amount);
  },
});

/** Totales de ingresos y gastos por mes — para el LineChart de 6 meses. */
export const monthlySummary = query({
  args: { months: v.array(v.string()) },
  handler: async (ctx, { months }) => {
    const clerkId = await getCurrentUserId(ctx);
    const safeMonths = months.slice(0, 24);

    return await Promise.all(
      safeMonths.map(async (month) => {
        const txs = await ctx.db
          .query("transactions")
          .withIndex("by_user_month", (q) =>
            q.eq("userId", clerkId).eq("month", month)
          )
          .collect();

        const ingresos = txs
          .filter((t) => t.type === "ingreso")
          .reduce((s, t) => s + t.amount, 0);
        const gastos = txs
          .filter((t) => t.type === "gasto")
          .reduce((s, t) => s + t.amount, 0);

        return { month, ingresos, gastos };
      })
    );
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

    // Actualizar balance de la tarjeta (solo gastos)
    if (args.cardId && args.type === "gasto") {
      await applyCardDelta(ctx, args.cardId, args.amount);
    }

    // Recalcular budget.spent si es gasto con categoría
    if (args.type === "gasto" && args.categoryId) {
      await applyBudgetDelta(ctx, user.clerkId, args.categoryId, month, args.amount);
    }

    return txId;
  },
});

export const update = mutation({
  args: {
    transactionId: v.id("transactions"),
    description: v.optional(v.string()),
    categoryId: v.optional(v.id("categories")),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    date: v.optional(v.number()),
  },
  handler: async (ctx, { transactionId, ...fields }) => {
    if (fields.description !== undefined && (fields.description.length === 0 || fields.description.length > 200)) {
      throw new Error("La descripción debe tener entre 1 y 200 caracteres");
    }
    if (fields.notes !== undefined && fields.notes.length > 500) throw new Error("Las notas no pueden superar 500 caracteres");

    const user = await getCurrentUser(ctx);
    const tx = await ctx.db.get(transactionId);
    if (!tx || tx.userId !== user.clerkId) {
      throw new Error("Transacción no encontrada");
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (fields.description !== undefined) patch.description = fields.description;
    if (fields.categoryId !== undefined) patch.categoryId = fields.categoryId;
    if (fields.notes !== undefined) patch.notes = fields.notes;
    if (fields.tags !== undefined) patch.tags = fields.tags;
    if (fields.date !== undefined) {
      patch.date = fields.date;
      patch.month = toMonthString(fields.date);
    }

    // Recalcular budget.spent cuando cambia categoría o mes en un gasto
    if (tx.type === "gasto") {
      const newMonth = fields.date ? toMonthString(fields.date) : tx.month;
      const categoryChanged = fields.categoryId !== undefined && fields.categoryId !== tx.categoryId;
      const monthChanged = fields.date !== undefined && newMonth !== tx.month;

      if (categoryChanged || monthChanged) {
        if (tx.categoryId) {
          await applyBudgetDelta(ctx, tx.userId, tx.categoryId, tx.month, -tx.amount);
        }
        const newCategoryId = fields.categoryId ?? tx.categoryId;
        if (newCategoryId) {
          await applyBudgetDelta(ctx, tx.userId, newCategoryId, newMonth, tx.amount);
        }
      }
    }

    await ctx.db.patch(transactionId, patch);
  },
});

export const remove = mutation({
  args: { transactionId: v.id("transactions") },
  handler: async (ctx, { transactionId }) => {
    const user = await getCurrentUser(ctx);
    const tx = await ctx.db.get(transactionId);
    if (!tx || tx.userId !== user.clerkId) {
      throw new Error("Transacción no encontrada");
    }

    // Transferencias: eliminar ambas piernas y revertir ambos saldos
    if (tx.transferGroupId) {
      const legs = await ctx.db
        .query("transactions")
        .withIndex("by_transfer_group", (q) => q.eq("transferGroupId", tx.transferGroupId!))
        .collect();

      // outLeg fue insertada antes que inLeg en createTransfer; su cuenta fue debitada
      const [outLeg, inLeg] = [...legs].sort((a, b) => a._creationTime - b._creationTime);
      if (outLeg?.accountId) await applyAccountDelta(ctx, outLeg.accountId, outLeg.amount);
      if (inLeg?.accountId)  await applyAccountDelta(ctx, inLeg.accountId, -inLeg.amount);
      for (const leg of legs) await ctx.db.delete(leg._id);
      return;
    }

    // Revertir saldo de la cuenta
    if (tx.accountId) {
      const delta = tx.type === "ingreso" ? -tx.amount : tx.amount;
      await applyAccountDelta(ctx, tx.accountId, delta);
    }

    // Revertir balance de la tarjeta
    if (tx.cardId && tx.type === "gasto") {
      await applyCardDelta(ctx, tx.cardId, -tx.amount);
    }

    // Revertir budget.spent
    if (tx.type === "gasto" && tx.categoryId) {
      await applyBudgetDelta(ctx, user.clerkId, tx.categoryId, tx.month, -tx.amount);
    }

    await ctx.db.delete(transactionId);
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
      toAccountId: args.fromAccountId, // referencia de vuelta
      transferGroupId,
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

    return { transferGroupId, outTxId };
  },
});

/** Interna: crea transacción sin verificar auth (para crons de recurrentes). */
export const createInternal = internalMutation({
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
    recurringId: v.optional(v.id("recurringTransactions")),
  },
  handler: async (ctx, args) => {
    const month = toMonthString(args.date);
    const now = Date.now();

    const txId = await ctx.db.insert("transactions", {
      userId: args.userId,
      type: args.type,
      amount: args.amount,
      description: args.description,
      date: args.date,
      month,
      currency: args.currency,
      accountId: args.accountId,
      cardId: args.cardId,
      categoryId: args.categoryId,
      status: "completada",
      isRecurring: true,
      recurringId: args.recurringId,
      createdAt: now,
      updatedAt: now,
    });

    // Actualizar saldo de cuenta
    if (args.accountId) {
      const account = await ctx.db.get(args.accountId);
      if (account) {
        const delta = args.type === "ingreso" ? args.amount : -args.amount;
        await ctx.db.patch(args.accountId, {
          balance: account.balance + delta,
          updatedAt: now,
        });
      }
    }

    // Actualizar budget.spent si es gasto con categoría
    if (args.type === "gasto" && args.categoryId) {
      const budget = await ctx.db
        .query("budgets")
        .withIndex("by_user_category_month", (q) =>
          q.eq("userId", args.userId)
            .eq("categoryId", args.categoryId!)
            .eq("month", month)
        )
        .unique();
      if (budget) {
        await ctx.db.patch(budget._id, {
          spent: budget.spent + args.amount,
          updatedAt: now,
        });
      }
    }

    return txId;
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
