import { query, mutation, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
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

export const listArchived = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await getCurrentUserId(ctx);
    const results = await ctx.db
      .query("categories")
      .withIndex("by_user_archived", (q) =>
        q.eq("userId", clerkId).eq("archived", true)
      )
      .collect();
    return results;
  },
});

export const transactionCount = query({
  args: { categoryId: v.id("categories") },
  handler: async (ctx, { categoryId }) => {
    const clerkId = await getCurrentUserId(ctx);
    const cat = await ctx.db.get(categoryId);
    if (!cat || cat.userId !== clerkId) return 0;
    const txs = await ctx.db
      .query("transactions")
      .withIndex("by_user_category_month", (q) =>
        q.eq("userId", clerkId).eq("categoryId", categoryId)
      )
      .take(501);
    return txs.length;
  },
});

export const remove = mutation({
  args: { categoryId: v.id("categories") },
  handler: async (ctx, { categoryId }) => {
    const user = await getCurrentUser(ctx);
    const cat = await ctx.db.get(categoryId);
    if (!cat || cat.userId !== user.clerkId) throw new Error("Categoría no encontrada");
    if (!cat.archived) throw new Error("Solo se pueden eliminar categorías archivadas");

    const existingTx = await ctx.db
      .query("transactions")
      .withIndex("by_user_category_month", (q) =>
        q.eq("userId", user.clerkId).eq("categoryId", categoryId)
      )
      .take(1);
    if (existingTx.length > 0) {
      throw new Error("La categoría tiene transacciones — migrá los movimientos antes de eliminar");
    }

    const now = Date.now();

    // Desvincula transacciones recurrentes
    const recurrings = await ctx.db
      .query("recurringTransactions")
      .withIndex("by_user", (q) => q.eq("userId", user.clerkId))
      .filter((q) => q.eq(q.field("categoryId"), categoryId))
      .collect();
    for (const rt of recurrings) {
      await ctx.db.patch(rt._id, { categoryId: undefined, updatedAt: now });
    }

    // Elimina presupuestos asociados
    const budgets = await ctx.db
      .query("budgets")
      .withIndex("by_user_category_month", (q) =>
        q.eq("userId", user.clerkId).eq("categoryId", categoryId)
      )
      .collect();
    for (const budget of budgets) {
      await ctx.db.delete(budget._id);
    }

    await ctx.db.delete(categoryId);
  },
});

type CategoryType = "ingreso" | "gasto" | "ambos";

function isTypeCompatible(sourceType: CategoryType, targetType: CategoryType): boolean {
  if (sourceType === "ambos") return true;
  return targetType === sourceType || targetType === "ambos";
}

export const migrateAndDelete = mutation({
  args: {
    categoryId: v.id("categories"),
    targetCategoryId: v.id("categories"),
  },
  handler: async (ctx, { categoryId, targetCategoryId }) => {
    const user = await getCurrentUser(ctx);
    const cat = await ctx.db.get(categoryId);
    if (!cat || cat.userId !== user.clerkId) throw new Error("Categoría no encontrada");
    if (!cat.archived) throw new Error("Solo se pueden eliminar categorías archivadas");
    if (categoryId === targetCategoryId) throw new Error("La categoría destino debe ser diferente");

    const targetCat = await ctx.db.get(targetCategoryId);
    if (!targetCat || targetCat.userId !== user.clerkId || targetCat.archived) {
      throw new Error("Categoría destino no válida");
    }
    if (!isTypeCompatible(cat.type, targetCat.type)) {
      throw new Error("El tipo de la categoría destino no es compatible");
    }

    const now = Date.now();
    const txBatch = await ctx.db
      .query("transactions")
      .withIndex("by_user_category_month", (q) =>
        q.eq("userId", user.clerkId).eq("categoryId", categoryId)
      )
      .take(100);

    for (const tx of txBatch) {
      await ctx.db.patch(tx._id, { categoryId: targetCategoryId, updatedAt: now });
    }

    if (txBatch.length === 100) {
      await ctx.scheduler.runAfter(0, internal.categories.continueMigrate, {
        categoryId,
        targetCategoryId,
        userId: user.clerkId,
      });
      return { willContinue: true };
    }

    await _cleanup(ctx, categoryId, targetCategoryId, user.clerkId, now);
    return { willContinue: false };
  },
});

export const continueMigrate = internalMutation({
  args: {
    categoryId: v.id("categories"),
    targetCategoryId: v.id("categories"),
    userId: v.string(),
  },
  handler: async (ctx, { categoryId, targetCategoryId, userId }) => {
    const now = Date.now();
    const txBatch = await ctx.db
      .query("transactions")
      .withIndex("by_user_category_month", (q) =>
        q.eq("userId", userId).eq("categoryId", categoryId)
      )
      .take(100);

    for (const tx of txBatch) {
      await ctx.db.patch(tx._id, { categoryId: targetCategoryId, updatedAt: now });
    }

    if (txBatch.length === 100) {
      await ctx.scheduler.runAfter(0, internal.categories.continueMigrate, {
        categoryId, targetCategoryId, userId,
      });
      return;
    }

    await _cleanup(ctx, categoryId, targetCategoryId, userId, now);
  },
});

async function _cleanup(
  ctx: MutationCtx,
  categoryId: Id<"categories">,
  targetCategoryId: Id<"categories">,
  userId: string,
  now: number
) {
  const recurrings = await ctx.db
    .query("recurringTransactions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .filter((q) => q.eq(q.field("categoryId"), categoryId))
    .collect();
  for (const rt of recurrings) {
    await ctx.db.patch(rt._id, { categoryId: targetCategoryId, updatedAt: now });
  }

  const budgets = await ctx.db
    .query("budgets")
    .withIndex("by_user_category_month", (q) =>
      q.eq("userId", userId).eq("categoryId", categoryId)
    )
    .collect();
  for (const budget of budgets) {
    await ctx.db.delete(budget._id);
  }

  await ctx.db.delete(categoryId);
}
