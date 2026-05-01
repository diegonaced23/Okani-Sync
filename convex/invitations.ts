import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/** Registra una invitación pendiente. Si ya existe una para ese email, es idempotente. */
export const createFromAdmin = internalMutation({
  args: {
    email: v.string(),
    role: v.union(v.literal("user"), v.literal("admin")),
    invitedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("invitations")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();
    if (existing) return existing._id;

    return ctx.db.insert("invitations", {
      email: args.email,
      role: args.role,
      status: "pending",
      invitedBy: args.invitedBy,
      createdAt: Date.now(),
    });
  },
});
