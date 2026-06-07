"use node";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

/**
 * Crea una invitación pendiente para desarrollo/pruebas local.
 * Idempotente: si ya existe una invitación pendiente para el email, no crea duplicados.
 *
 * Uso:
 *   npx convex run actions/seedTestInvitation:run --args '{"email":"test@example.com"}'
 *   npx convex run actions/seedTestInvitation:run --args '{"email":"test@example.com","role":"user"}'
 */
export const run = internalAction({
  args: {
    email: v.string(),
    role: v.optional(v.union(v.literal("user"), v.literal("admin"))),
  },
  handler: async (ctx, args): Promise<{ status: string; email: string; role: string }> => {
    const role = args.role ?? "user";

    await ctx.runMutation(internal.invitations.createFromAdmin, {
      email: args.email,
      role,
      invitedBy: "seed",
    });

    console.log(`[seedTestInvitation] Invitación creada → ${args.email} (${role})`);
    return { status: "ok", email: args.email, role };
  },
});
