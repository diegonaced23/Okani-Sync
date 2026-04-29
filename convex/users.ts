import { internalMutation, query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { DEFAULT_CATEGORIES, AUDIT_ACTIONS } from "../src/lib/constants";

// ─── Query pública: usuario autenticado actual ────────────────────────────────

export const getMe = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
  },
});

/** Actualiza la moneda preferida del usuario. */
export const updateCurrency = mutation({
  args: { currency: v.string() },
  handler: async (ctx, { currency }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("No autenticado");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("Usuario no encontrado");
    await ctx.db.patch(user._id, { currency, updatedAt: Date.now() });
  },
});

// ─── Query interna: buscar usuario por clerkId ────────────────────────────────

export const getByClerkId = query({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();
  },
});

// ─── Mutation interna: sincronizar desde webhook Clerk ────────────────────────

export const upsertFromClerk = internalMutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        email: args.email,
        imageUrl: args.imageUrl,
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    // Crear usuario nuevo
    const userId = await ctx.db.insert("users", {
      clerkId: args.clerkId,
      email: args.email,
      name: args.name,
      imageUrl: args.imageUrl,
      role: "user",
      active: true,
      locale: "es-CO",
      currency: "COP",
      theme: "dark",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Seed: cuenta Billetera por defecto
    await ctx.db.insert("accounts", {
      ownerId: args.clerkId,
      name: "Billetera",
      type: "billetera",
      balance: 0,
      initialBalance: 0,
      currency: "COP",
      color: "#4ADE80",
      icon: "wallet",
      isDefault: true,
      isShared: false,
      archived: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Seed: categorías por defecto
    const now = Date.now();
    for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
      const cat = DEFAULT_CATEGORIES[i];
      await ctx.db.insert("categories", {
        userId: args.clerkId,
        name: cat.name,
        type: cat.type,
        color: cat.color,
        icon: cat.icon,
        isDefault: true,
        archived: false,
        order: i,
        createdAt: now,
        updatedAt: now,
      });
    }

    return userId;
  },
});

// ─── Mutation interna: borrar usuario (llamada desde deleteUserCascade) ────────

export const deleteByClerkId = internalMutation({
  args: { clerkId: v.string(), deletedBy: v.string() },
  handler: async (ctx, { clerkId, deletedBy }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (!user) return;

    await ctx.db.insert("auditLogs", {
      userId: deletedBy,
      targetUserId: clerkId,
      action: AUDIT_ACTIONS.USER_DELETED,
      entity: "users",
      entityId: user._id,
      metadata: { email: user.email, name: user.name },
      createdAt: Date.now(),
    });

    await ctx.db.delete(user._id);
  },
});
