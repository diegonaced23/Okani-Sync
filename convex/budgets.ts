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
