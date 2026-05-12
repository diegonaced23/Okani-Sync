import { query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserId } from "./lib/auth";

export const listByLoan = query({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const clerkId = await getCurrentUserId(ctx);
    const loan = await ctx.db.get(loanId);
    if (!loan || loan.userId !== clerkId) return [];
    return await ctx.db
      .query("loanRepayments")
      .withIndex("by_loan", (q) => q.eq("loanId", loanId))
      .order("desc")
      .collect();
  },
});

export const listByMonth = query({
  args: { month: v.string() },
  handler: async (ctx, { month }) => {
    const clerkId = await getCurrentUserId(ctx);
    return await ctx.db
      .query("loanRepayments")
      .withIndex("by_user_month", (q) =>
        q.eq("userId", clerkId).eq("month", month)
      )
      .order("desc")
      .collect();
  },
});
