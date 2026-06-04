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

/**
 * Todas las cuotas de una tarjeta (pagadas + pendientes), enriquecidas con la
 * descripción y el total de cuotas de la compra correspondiente.
 * Usadas por la simulación FIFO client-side en el formulario de pago.
 */
export const listAllByCard = query({
  args: { cardId: v.id("cards") },
  handler: async (ctx, { cardId }) => {
    const clerkId = await getCurrentUserId(ctx);
    const card = await ctx.db.get(cardId);
    if (!card || card.userId !== clerkId) return [];

    const installments = await ctx.db
      .query("cardInstallments")
      .withIndex("by_card_month", (q) => q.eq("cardId", cardId))
      .collect();

    // Batch-lookup de compras únicas para obtener descripción y totalInstallments
    const purchaseCache = new Map<string, { description: string; totalInstallments: number }>();
    for (const inst of installments) {
      if (!purchaseCache.has(inst.purchaseId)) {
        const p = await ctx.db.get(inst.purchaseId);
        purchaseCache.set(inst.purchaseId, {
          description: p?.description ?? "Compra",
          totalInstallments: p?.totalInstallments ?? 1,
        });
      }
    }

    return installments.map((inst) => {
      const purchase = purchaseCache.get(inst.purchaseId)!;
      return {
        _id: inst._id,
        amount: inst.amount,
        dueDate: inst.dueDate,
        month: inst.month,
        paid: inst.paid,
        paidAt: inst.paidAt,
        installmentNumber: inst.installmentNumber,
        totalInstallments: purchase.totalInstallments,
        description:
          purchase.totalInstallments > 1
            ? `${purchase.description} — Cuota ${inst.installmentNumber}/${purchase.totalInstallments}`
            : purchase.description,
      };
    });
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
