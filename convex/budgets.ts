import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser, getCurrentUserId } from "./lib/auth";

export const listByMonth = query({
  args: { month: v.string() },
  handler: async (ctx, { month }) => {
    const clerkId = await getCurrentUserId(ctx);
    return await ctx.db
      .query("budgets")
      .withIndex("by_user_month", (q) =>
        q.eq("userId", clerkId).eq("month", month)
      )
      .collect();
  },
});

/** Presupuesto con nombre de categoría enriquecido para la UI. */
export const listByMonthWithCategory = query({
  args: { month: v.string() },
  handler: async (ctx, { month }) => {
    const clerkId = await getCurrentUserId(ctx);
    const budgets = await ctx.db
      .query("budgets")
      .withIndex("by_user_month", (q) =>
        q.eq("userId", clerkId).eq("month", month)
      )
      .collect();

    return await Promise.all(
      budgets.map(async (b) => {
        const category = await ctx.db.get(b.categoryId);
        return { ...b, categoryName: category?.name, categoryColor: category?.color };
      })
    );
  },
});

export const create = mutation({
  args: {
    categoryId: v.id("categories"),
    amount: v.number(), // en centavos
    currency: v.string(),
    month: v.string(),
    alertThreshold: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const now = Date.now();
    return await ctx.db.insert("budgets", {
      userId: user.clerkId,
      categoryId: args.categoryId,
      amount: args.amount,
      spent: 0,
      currency: args.currency,
      month: args.month,
      alertThreshold: args.alertThreshold ?? 80,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    budgetId: v.id("budgets"),
    amount: v.optional(v.number()),
    alertThreshold: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { budgetId, ...fields }) => {
    const user = await getCurrentUser(ctx);
    const budget = await ctx.db.get(budgetId);
    if (!budget || budget.userId !== user.clerkId) throw new Error("Presupuesto no encontrado");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) patch[k] = v;
    }
    await ctx.db.patch(budgetId, patch);
  },
});

export const remove = mutation({
  args: { budgetId: v.id("budgets") },
  handler: async (ctx, { budgetId }) => {
    const user = await getCurrentUser(ctx);
    const budget = await ctx.db.get(budgetId);
    if (!budget || budget.userId !== user.clerkId) throw new Error("Presupuesto no encontrado");
    await ctx.db.delete(budgetId);
  },
});
