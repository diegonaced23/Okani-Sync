"use node";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { clerkCreateUser, clerkCreateSignInToken } from "../lib/clerkApi";
import { AUDIT_ACTIONS } from "../../src/lib/constants";

/** El administrador crea un nuevo usuario. */
export const createByAdmin = action({
  args: {
    name: v.string(),
    email: v.string(),
    role: v.union(v.literal("user"), v.literal("admin")),
  },
  handler: async (ctx, args) => {
    // Verificar que el invocador es admin
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

    const nameParts = args.name.trim().split(" ");
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(" ");

    // 1. Crear en Clerk
    const clerkUser = await clerkCreateUser({
      email: args.email,
      firstName,
      lastName,
      secretKey,
    });

    // 2. Crear en Convex (sin esperar al webhook — idempotente)
    await ctx.runMutation(internal.users.createFromAdmin, {
      clerkId: clerkUser.id,
      email: args.email,
      name: args.name.trim(),
      role: args.role,
      createdBy: identity.subject,
    });

    // 3. Audit log
    await ctx.runMutation(internal.users.logAuditAction, {
      userId: identity.subject,
      targetUserId: clerkUser.id,
      action: AUDIT_ACTIONS.USER_CREATED,
      metadata: { email: args.email, name: args.name, role: args.role },
    });

    // 4. Email de bienvenida (no bloquea)
    await ctx.runAction(internal.actions.sendWelcomeEmail.run, {
      clerkId: clerkUser.id,
    });

    return clerkUser.id;
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
