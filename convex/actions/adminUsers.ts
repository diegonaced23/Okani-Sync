"use node";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { clerkCreateInvitation, clerkCreateSignInToken } from "../lib/clerkApi";
import { AUDIT_ACTIONS } from "../../src/lib/constants";

/** El administrador invita a un nuevo usuario. Clerk envía el email de invitación. */
export const createByAdmin = action({
  args: {
    email: v.string(),
    role: v.union(v.literal("user"), v.literal("admin")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("No autenticado");

    const adminUser = await ctx.runQuery(internal.users.getByClerkIdInternal, {
      clerkId: identity.subject,
    });
    if (!adminUser || adminUser.role !== "admin") {
      throw new Error("Acceso denegado: se requiere rol de administrador");
    }

    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) throw new Error("CLERK_SECRET_KEY no configurada");

    // 1. Registrar invitación en Convex — es la fuente de verdad para el control de acceso
    await ctx.runMutation(internal.invitations.createFromAdmin, {
      email: args.email,
      role: args.role,
      invitedBy: identity.subject,
    });

    // 2. Clerk envía el email de invitación automáticamente
    await clerkCreateInvitation({
      email: args.email,
      role: args.role,
      secretKey,
    });

    await ctx.runMutation(internal.users.logAuditAction, {
      userId: identity.subject,
      action: AUDIT_ACTIONS.USER_INVITED,
      metadata: { email: args.email, role: args.role },
    });
  },
});

/** Genera un link de acceso temporal (sign-in token) para que el admin se lo comparta al usuario. */
export const generateResetLink = action({
  args: { targetClerkId: v.string() },
  handler: async (ctx, { targetClerkId }): Promise<string> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("No autenticado");

    const adminUser = await ctx.runQuery(internal.users.getByClerkIdInternal, {
      clerkId: identity.subject,
    });
    if (!adminUser || adminUser.role !== "admin") {
      throw new Error("Acceso denegado: se requiere rol de administrador");
    }

    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) throw new Error("CLERK_SECRET_KEY no configurada");

    const url = await clerkCreateSignInToken({ clerkId: targetClerkId, secretKey });

    await ctx.runMutation(internal.users.logAuditAction, {
      userId: identity.subject,
      targetUserId: targetClerkId,
      action: AUDIT_ACTIONS.USER_PASSWORD_RESET,
      metadata: { generatedAt: Date.now() },
    });

    return url;
  },
});
