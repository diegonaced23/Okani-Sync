import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser, getCurrentUserId } from "./lib/auth";

export const list = query({
  args: {
    type: v.optional(
      v.union(v.literal("ingreso"), v.literal("gasto"), v.literal("ambos"))
    ),
  },
  handler: async (ctx, { type }) => {
    const clerkId = await getCurrentUserId(ctx);
    let results;
    if (type) {
      results = await ctx.db
        .query("categories")
        .withIndex("by_user_type", (q) =>
          q.eq("userId", clerkId).eq("type", type)
        )
        .filter((q) => q.eq(q.field("archived"), false))
        .collect();
    } else {
      results = await ctx.db
        .query("categories")
        .withIndex("by_user_archived", (q) =>
          q.eq("userId", clerkId).eq("archived", false)
        )
        .collect();
    }
    return results.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    type: v.union(v.literal("ingreso"), v.literal("gasto"), v.literal("ambos")),
    color: v.string(),
    icon: v.string(),
    parentId: v.optional(v.id("categories")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const now = Date.now();
    const existing = await ctx.db
      .query("categories")
      .withIndex("by_user_archived", (q) =>
        q.eq("userId", user.clerkId).eq("archived", false)
      )
      .collect();
    const maxOrder = existing.reduce((max, c) => Math.max(max, c.order ?? -1), -1);
    return await ctx.db.insert("categories", {
      userId: user.clerkId,
      name: args.name,
      type: args.type,
      color: args.color,
      icon: args.icon,
      parentId: args.parentId,
      isDefault: false,
      archived: false,
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    categoryId: v.id("categories"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
  },
  handler: async (ctx, { categoryId, ...fields }) => {
    const user = await getCurrentUser(ctx);
    const cat = await ctx.db.get(categoryId);
    if (!cat || cat.userId !== user.clerkId) {
      throw new Error("Categoría no encontrada");
    }
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) patch[k] = v;
    }
    await ctx.db.patch(categoryId, patch);
  },
});

export const archive = mutation({
  args: { categoryId: v.id("categories") },
  handler: async (ctx, { categoryId }) => {
    const user = await getCurrentUser(ctx);
    const cat = await ctx.db.get(categoryId);
    if (!cat || cat.userId !== user.clerkId) {
      throw new Error("Categoría no encontrada");
    }
    await ctx.db.patch(categoryId, { archived: true, updatedAt: Date.now() });
  },
});

export const reorder = mutation({
  args: {
    categoryIds: v.array(v.id("categories")),
  },
  handler: async (ctx, { categoryIds }) => {
    const user = await getCurrentUser(ctx);
    const now = Date.now();
    for (let i = 0; i < categoryIds.length; i++) {
      const cat = await ctx.db.get(categoryIds[i]);
      if (!cat || cat.userId !== user.clerkId) {
        throw new Error("Categoría no encontrada");
      }
      await ctx.db.patch(categoryIds[i], { order: i, updatedAt: now });
    }
  },
});
