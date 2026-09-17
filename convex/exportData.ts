import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { EXPORT_MAX_ROWS_PER_TABLE } from "../src/lib/constants";

/**
 * Lecturas acotadas por usuario para el export completo de la cuenta.
 *
 * Una internal query por grupo de tablas en vez de una sola: cada query de
 * Convex es una transacción con límite de documentos leídos, y quince tablas
 * con hasta 10 000 filas cada una no caben en una sola.
 */

export const readAccountTables = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const limit = EXPORT_MAX_ROWS_PER_TABLE;
    return {
      accounts: await ctx.db
        .query("accounts")
        .withIndex("by_owner", (q) => q.eq("ownerId", userId))
        .take(limit),
      accountShares: await ctx.db
        .query("accountShares")
        .withIndex("by_owner", (q) => q.eq("ownerId", userId))
        .take(limit),
      categories: await ctx.db
        .query("categories")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(limit),
    };
  },
});

export const readCardTables = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const limit = EXPORT_MAX_ROWS_PER_TABLE;
    return {
      cards: await ctx.db
        .query("cards")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(limit),
      cardPurchases: await ctx.db
        .query("cardPurchases")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(limit),
      // cardInstallments no tiene índice `by_user` suelto; `by_user_month`
      // sirve igual porque userId es su primer campo (prefijo del índice).
      cardInstallments: await ctx.db
        .query("cardInstallments")
        .withIndex("by_user_month", (q) => q.eq("userId", userId))
        .take(limit),
    };
  },
});

export const readTransactionTables = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const limit = EXPORT_MAX_ROWS_PER_TABLE;
    return {
      transactions: await ctx.db
        .query("transactions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(limit),
      recurringTransactions: await ctx.db
        .query("recurringTransactions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(limit),
      budgets: await ctx.db
        .query("budgets")
        .withIndex("by_user_month", (q) => q.eq("userId", userId))
        .take(limit),
    };
  },
});

export const readDebtTables = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const limit = EXPORT_MAX_ROWS_PER_TABLE;
    return {
      debts: await ctx.db
        .query("debts")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(limit),
      debtPayments: await ctx.db
        .query("debtPayments")
        .withIndex("by_user_month", (q) => q.eq("userId", userId))
        .take(limit),
      loans: await ctx.db
        .query("loans")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(limit),
      loanRepayments: await ctx.db
        .query("loanRepayments")
        .withIndex("by_user_month", (q) => q.eq("userId", userId))
        .take(limit),
    };
  },
});

export const readGoalTables = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const limit = EXPORT_MAX_ROWS_PER_TABLE;
    return {
      goals: await ctx.db
        .query("goals")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(limit),
      netWorthSnapshots: await ctx.db
        .query("netWorthSnapshots")
        .withIndex("by_user_month", (q) => q.eq("userId", userId))
        .take(limit),
    };
  },
});

/**
 * Borra el archivo temporal de exportación. Programada por
 * `actions/exportMyData.run`.
 *
 * Vive aquí y no en `actions/exportMyData.ts` porque `/actions` es una
 * carpeta legacy de Convex donde cada archivo debe llevar `"use node"`, y
 * ese directive es incompatible con exportar una mutation en el mismo
 * archivo (regla del proyecto: nunca `"use node"` junto a queries/mutations).
 */
export const cleanup = internalMutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    await ctx.storage.delete(storageId);
  },
});
