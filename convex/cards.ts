import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser, getCurrentUserId } from "./lib/auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await getCurrentUserId(ctx);
    return await ctx.db
      .query("cards")
      .withIndex("by_user_archived", (q) =>
        q.eq("userId", clerkId).eq("archived", false)
      )
      .collect();
  },
});

export const getById = query({
  args: { cardId: v.id("cards") },
  handler: async (ctx, { cardId }) => {
    const clerkId = await getCurrentUserId(ctx);
    const card = await ctx.db.get(cardId);
    if (!card || card.userId !== clerkId) return null;
    return card;
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    bankName: v.string(),
    lastFourDigits: v.string(),
    brand: v.optional(
      v.union(
        v.literal("visa"),
        v.literal("mastercard"),
        v.literal("amex"),
        v.literal("diners"),
        v.literal("otro")
      )
    ),
    creditLimit: v.number(),   // en centavos
    cutoffDay: v.number(),
    paymentDay: v.number(),
    interestRate: v.optional(v.number()),
    currency: v.string(),
    color: v.string(),
    icon: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const now = Date.now();
    return await ctx.db.insert("cards", {
      userId: user.clerkId,
      name: args.name,
      bankName: args.bankName,
      lastFourDigits: args.lastFourDigits,
      brand: args.brand,
      creditLimit: args.creditLimit,
      currentBalance: 0,
      availableCredit: args.creditLimit,
      cutoffDay: args.cutoffDay,
      paymentDay: args.paymentDay,
      interestRate: args.interestRate,
      currency: args.currency,
      color: args.color,
      icon: args.icon,
      archived: false,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    cardId: v.id("cards"),
    name: v.optional(v.string()),
    bankName: v.optional(v.string()),
    creditLimit: v.optional(v.number()),
    interestRate: v.optional(v.number()),
    cutoffDay: v.optional(v.number()),
    paymentDay: v.optional(v.number()),
    color: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { cardId, creditLimit, ...fields }) => {
    const user = await getCurrentUser(ctx);
    const card = await ctx.db.get(cardId);
    if (!card || card.userId !== user.clerkId) throw new Error("Tarjeta no encontrada");

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) patch[k] = v;
    }
    if (creditLimit !== undefined) {
      patch.creditLimit = creditLimit;
      patch.availableCredit = creditLimit - card.currentBalance;
    }
    await ctx.db.patch(cardId, patch);
  },
});

export const archive = mutation({
  args: { cardId: v.id("cards") },
  handler: async (ctx, { cardId }) => {
    const user = await getCurrentUser(ctx);
    const card = await ctx.db.get(cardId);
    if (!card || card.userId !== user.clerkId) throw new Error("Tarjeta no encontrada");
    await ctx.db.patch(cardId, { archived: true, updatedAt: Date.now() });
  },
});

/** Elimina la tarjeta y todos sus registros asociados (cascade). */
export const remove = mutation({
  args: { cardId: v.id("cards") },
  handler: async (ctx, { cardId }) => {
    const user = await getCurrentUser(ctx);
    const card = await ctx.db.get(cardId);
    if (!card || card.userId !== user.clerkId) throw new Error("Tarjeta no encontrada");

    // 1. Compras y sus cuotas
    const purchases = await ctx.db
      .query("cardPurchases")
      .withIndex("by_card", (q) => q.eq("cardId", cardId))
      .collect();

    for (const purchase of purchases) {
      const installments = await ctx.db
        .query("cardInstallments")
        .withIndex("by_purchase", (q) => q.eq("purchaseId", purchase._id))
        .collect();
      for (const inst of installments) {
        await ctx.db.delete(inst._id);
      }
      await ctx.db.delete(purchase._id);
    }

    // 2. Transacciones vinculadas a esta tarjeta
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_card", (q) => q.eq("cardId", cardId))
      .collect();
    for (const tx of transactions) {
      await ctx.db.delete(tx._id);
    }

    // 3. Transacciones recurrentes que referencien esta tarjeta
    const recurring = await ctx.db
      .query("recurringTransactions")
      .withIndex("by_user", (q) => q.eq("userId", user.clerkId))
      .collect();
    for (const rt of recurring) {
      if (rt.cardId === cardId || rt.targetCardId === cardId) {
        await ctx.db.delete(rt._id);
      }
    }

    // 4. La tarjeta
    await ctx.db.delete(cardId);
  },
});
