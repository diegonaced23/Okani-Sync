"use node";
import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { v } from "convex/values";
import { clerkCreateInvitation, clerkCreateSignInToken, clerkUpdateUserMetadata } from "../lib/clerkApi";
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

/**
 * Cambia el rol de un usuario sincronizando Clerk (publicMetadata) y Convex.
 * El JWT de Clerk debe incluir el rol para que el middleware lo reconozca.
 * El usuario debe cerrar sesión y volver a entrar para que el nuevo JWT entre en efecto.
 */
export const updateRoleByAdmin = action({
  args: {
    targetClerkId: v.string(),
    role: v.union(v.literal("user"), v.literal("admin")),
  },
  handler: async (ctx, { targetClerkId, role }) => {
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

    // 1. Actualizar publicMetadata en Clerk → el JWT reflejará el nuevo rol
    await clerkUpdateUserMetadata({
      clerkId: targetClerkId,
      publicMetadata: { role },
      secretKey,
    });

    // 2. Actualizar Convex
    await ctx.runMutation(api.users.updateByAdmin, {
      targetClerkId,
      role,
    });
  },
});

/**
 * Sincroniza el rol del usuario autenticado desde Convex hacia Clerk (publicMetadata).
 * Se llama en cada login desde AuthGuard para que el JWT siempre refleje el rol real.
 * Falla silenciosamente — no bloquea el acceso si Clerk no responde.
 */
export const syncRoleToClerk = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return;

    const user = await ctx.runQuery(internal.users.getByClerkIdInternal, {
      clerkId: identity.subject,
    });
    if (!user) return;

    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) return;

    await clerkUpdateUserMetadata({
      clerkId: identity.subject,
      publicMetadata: { role: user.role },
      secretKey,
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
