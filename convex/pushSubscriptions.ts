import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserId } from "./lib/auth";

const subscriptionShape = v.object({
  endpoint: v.string(),
  keys: v.object({ p256dh: v.string(), auth: v.string() }),
});

// ─── Queries ──────────────────────────────────────────────────────────────────

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await getCurrentUserId(ctx);
    return await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", clerkId))
      .collect();
  },
});

/** Interna: para que la action de alertas consulte subs sin autenticación. */
export const listForUser = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

/** Guarda (o actualiza si ya existe) la suscripción del dispositivo actual. */
export const save = mutation({
  args: {
    subscription: subscriptionShape,
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const clerkId = await getCurrentUserId(ctx);
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) =>
        q.eq("endpoint", args.subscription.endpoint)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        keys: args.subscription.keys,
        userAgent: args.userAgent,
      });
      return existing._id;
    }

    return await ctx.db.insert("pushSubscriptions", {
      userId: clerkId,
      endpoint: args.subscription.endpoint,
      keys: args.subscription.keys,
      userAgent: args.userAgent,
      createdAt: Date.now(),
    });
  },
});

/** Elimina la suscripción del endpoint dado (al desactivar notificaciones). */
export const remove = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, { endpoint }) => {
    const clerkId = await getCurrentUserId(ctx);
    const sub = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
      .unique();
    if (!sub || sub.userId !== clerkId) return;
    await ctx.db.delete(sub._id);
  },
});

/** Interna: retorna todos los userId distintos que tienen al menos una suscripción push activa. */
export const listDistinctUserIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const subs = await ctx.db.query("pushSubscriptions").take(1000);
    return [...new Set(subs.map((s) => s.userId))];
  },
});

/** Interna: limpia subs caducadas (410 Gone). */
export const removeByEndpoint = internalMutation({
  args: { endpoint: v.string() },
  handler: async (ctx, { endpoint }) => {
    const sub = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
      .unique();
    if (sub) await ctx.db.delete(sub._id);
  },
});
