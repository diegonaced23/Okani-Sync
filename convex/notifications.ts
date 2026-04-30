import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserId } from "./lib/auth";

// ─── Queries ──────────────────────────────────────────────────────────────────

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 20 }) => {
    const clerkId = await getCurrentUserId(ctx);
    const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 100);
    return await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", clerkId))
      .order("desc")
      .take(safeLimit);
  },
});

export const listUnread = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await getCurrentUserId(ctx);
    return await ctx.db
      .query("notifications")
      .withIndex("by_user_read", (q) =>
        q.eq("userId", clerkId).eq("read", false)
      )
      .order("desc")
      .collect();
  },
});

export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await getCurrentUserId(ctx);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_read", (q) =>
        q.eq("userId", clerkId).eq("read", false)
      )
      .collect();
    return unread.length;
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

export const markAsRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }) => {
    const clerkId = await getCurrentUserId(ctx);
    const notif = await ctx.db.get(notificationId);
    if (!notif || notif.userId !== clerkId) return;
    await ctx.db.patch(notificationId, { read: true });
  },
});

export const markAllAsRead = mutation({
  args: {},
  handler: async (ctx) => {
    const clerkId = await getCurrentUserId(ctx);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_read", (q) =>
        q.eq("userId", clerkId).eq("read", false)
      )
      .collect();
    await Promise.all(unread.map((n) => ctx.db.patch(n._id, { read: true })));
  },
});

/** Crea una notificación — llamado desde crons y mutations de negocio. */
export const createInternal = internalMutation({
  args: {
    userId: v.string(),
    type: v.union(
      v.literal("presupuesto_alerta"),
      v.literal("presupuesto_excedido"),
      v.literal("cuota_proxima"),
      v.literal("deuda_vencida"),
      v.literal("pago_tarjeta_proximo"),
      v.literal("cuenta_compartida"),
      v.literal("share_aceptado"),
      v.literal("sistema")
    ),
    title: v.string(),
    message: v.string(),
    actionUrl: v.optional(v.string()),
    relatedEntityId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("notifications", {
      userId: args.userId,
      type: args.type,
      title: args.title,
      message: args.message,
      read: false,
      pushSent: false,
      actionUrl: args.actionUrl,
      relatedEntityId: args.relatedEntityId,
      createdAt: Date.now(),
    });
  },
});

/** Marca la notificación como push enviado. */
export const markPushSent = internalMutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }) => {
    await ctx.db.patch(notificationId, { pushSent: true });
  },
});
