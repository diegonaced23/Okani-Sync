import { query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserId } from "./lib/auth";

export const listByPurchase = query({
  args: { purchaseId: v.id("cardPurchases") },
  handler: async (ctx, { purchaseId }) => {
    const clerkId = await getCurrentUserId(ctx);
    const purchase = await ctx.db.get(purchaseId);
    if (!purchase || purchase.userId !== clerkId) return [];
    return await ctx.db
      .query("cardInstallments")
      .withIndex("by_purchase", (q) => q.eq("purchaseId", purchaseId))
      .collect();
  },
});

export const listByUserMonth = query({
  args: { month: v.string() },
  handler: async (ctx, { month }) => {
    const clerkId = await getCurrentUserId(ctx);
    return await ctx.db
      .query("cardInstallments")
      .withIndex("by_user_month", (q) =>
        q.eq("userId", clerkId).eq("month", month)
      )
      .collect();
  },
});

export const listByCardMonth = query({
  args: { cardId: v.id("cards"), month: v.string() },
  handler: async (ctx, { cardId, month }) => {
    const clerkId = await getCurrentUserId(ctx);
    const card = await ctx.db.get(cardId);
    if (!card || card.userId !== clerkId) return [];
    return await ctx.db
      .query("cardInstallments")
      .withIndex("by_card_month", (q) =>
        q.eq("cardId", cardId).eq("month", month)
      )
      .collect();
  },
});

/** Cuotas pendientes del usuario (para alertas y crons). */
export const listUnpaidByUser = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await getCurrentUserId(ctx);
    return await ctx.db
      .query("cardInstallments")
      .withIndex("by_user_paid", (q) =>
        q.eq("userId", clerkId).eq("paid", false)
      )
      .collect();
  },
});
