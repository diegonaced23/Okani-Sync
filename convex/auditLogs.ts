import { query } from "./_generated/server";
import { v } from "convex/values";
import { assertAdmin } from "./lib/auth";

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 50 }) => {
    await assertAdmin(ctx);
    return await ctx.db
      .query("auditLogs")
      .order("desc")
      .take(limit);
  },
});

export const listForUser = query({
  args: { targetClerkId: v.string() },
  handler: async (ctx, { targetClerkId }) => {
    await assertAdmin(ctx);
    return await ctx.db
      .query("auditLogs")
      .withIndex("by_target", (q) => q.eq("targetUserId", targetClerkId))
      .order("desc")
      .collect();
  },
});
