import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

// Stub — implementación completa en Sprint 9
export const run = internalAction({
  args: { clerkId: v.string(), deletedBy: v.string() },
  handler: async (ctx, { clerkId, deletedBy }) => {
    await ctx.runMutation(internal.users.deleteByClerkId, {
      clerkId,
      deletedBy,
    });
  },
});
