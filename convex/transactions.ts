import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getCurrentUser, getCurrentUserId } from "./lib/auth";
import { assertCanWrite } from "./lib/permissions";
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
    const clerkId = await getCurrentUserId(ctx);
    // Incluye tanto tx donde accountId = origen como transferencias donde toAccountId = esta cuenta
    const direct = await ctx.db
      .query("transactions")
      .withIndex("by_account_month", (q) =>
        q.eq("accountId", accountId).eq("month", month)
      )
      .order("desc")
      .collect();
    // Filtramos solo las que pertenecen al usuario autenticado (o cuentas compartidas)
    return direct.filter((t) => t.userId === clerkId || t.accountId === accountId);
  },
});

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 10 }) => {
    const clerkId = await getCurrentUserId(ctx);
    return await ctx.db
      .query("transactions")
      .withIndex("by_user_date", (q) => q.eq("userId", clerkId))
      .order("desc")
      .take(limit);
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
    categoryId: v.optional(v.id("categories")),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    receiptStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    if (args.accountId) {
      await assertCanWrite(ctx, args.accountId);
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

    // Revertir saldo de la cuenta
    if (tx.accountId) {
      const delta = tx.type === "ingreso" ? -tx.amount : tx.amount;
      await applyAccountDelta(ctx, tx.accountId, delta);
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
