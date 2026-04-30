import { query, internalQuery } from "./_generated/server";
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

/** Interna: cuotas no pagadas cuya fecha de vencimiento cae en una ventana dada. */
export const listUpcomingUnpaid = internalQuery({
  args: { afterTs: v.number(), beforeTs: v.number() },
  handler: async (ctx, { afterTs, beforeTs }) => {
    // Scan todas las cuotas no pagadas y filtra por dueDate en la ventana
    // (No hay índice por dueDate; el volumen es manejable para MVP)
    const all = await ctx.db
      .query("cardInstallments")
      .filter((q) => q.eq(q.field("paid"), false))
      .collect();
    return all.filter((i) => i.dueDate >= afterTs && i.dueDate <= beforeTs);
  },
});
