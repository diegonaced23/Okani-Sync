import { query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserId } from "./lib/auth";

export const listByDebt = query({
  args: { debtId: v.id("debts") },
  handler: async (ctx, { debtId }) => {
    const clerkId = await getCurrentUserId(ctx);
    const debt = await ctx.db.get(debtId);
    if (!debt || debt.userId !== clerkId) return [];
    return await ctx.db
      .query("debtPayments")
      .withIndex("by_debt", (q) => q.eq("debtId", debtId))
      .order("desc")
      .collect();
  },
});

export const listByMonth = query({
  args: { month: v.string() },
  handler: async (ctx, { month }) => {
    const clerkId = await getCurrentUserId(ctx);
    return await ctx.db
      .query("debtPayments")
      .withIndex("by_user_month", (q) =>
        q.eq("userId", clerkId).eq("month", month)
      )
      .collect();
  },
});
