"use node";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { AUDIT_ACTIONS } from "../../src/lib/constants";
import { assertAdminFromAction } from "../lib/auth";
import { createAuth } from "../auth";

/**
 * Envía un magic link de acceso al email dado. Mismo mecanismo que usa
 * cualquier login normal (auth.api.signInMagicLink) — llamado server-side, sin
 * un Request real, así que el chequeo de origen/CSRF de Better Auth (que solo
 * corre cuando hay ctx.request) no aplica; ver originCheckMiddleware.
 *
 * Exportada para que convex/actions/seedAdmin.ts reuse el mismo mecanismo.
 */
export async function sendAccessMagicLink(
  ctx: Parameters<typeof createAuth>[0],
  email: string
) {
  await createAuth(ctx).api.signInMagicLink({
    body: { email, callbackURL: "/" },
    headers: new Headers(),
  });
}

/**
 * El administrador invita a un nuevo usuario. La fila de `invitations` sigue
 * siendo el gate real de registro (no cambia); lo que cambia es el envío del
 * email: en vez de una invitación de Clerk (que ya no controla el login),
 * se manda un magic link de Better Auth — crea el usuario con
 * emailVerified: true si aún no existe.
 */
export const createByAdmin = action({
  args: {
    email: v.string(),
    role: v.union(v.literal("user"), v.literal("admin")),
  },
  handler: async (ctx, args) => {
    const admin = await assertAdminFromAction(ctx);

    // 1. Registrar invitación en Convex — es la fuente de verdad para el control de acceso
    await ctx.runMutation(internal.invitations.createFromAdmin, {
      email: args.email,
      role: args.role,
      invitedBy: admin.clerkId,
    });

    // 2. Enviar el magic link de acceso
    await sendAccessMagicLink(ctx, args.email);

    await ctx.runMutation(internal.users.logAuditAction, {
      userId: admin.clerkId,
      action: AUDIT_ACTIONS.USER_INVITED,
      metadata: { email: args.email, role: args.role },
    });
  },
});

/**
 * Envía un magic link de acceso al usuario (reemplaza el sign-in token de
 * Clerk, que ya no controla el login de la app). El admin ya no ve ni
 * comparte un link manualmente — el correo llega directo al usuario.
 */
export const sendAccessEmail = action({
  args: { targetClerkId: v.string() },
  handler: async (ctx, { targetClerkId }) => {
    const admin = await assertAdminFromAction(ctx);

    const target = await ctx.runQuery(internal.users.getByClerkIdInternal, {
      clerkId: targetClerkId,
    });
    if (!target) throw new Error("Usuario no encontrado");

    await sendAccessMagicLink(ctx, target.email);

    await ctx.runMutation(internal.users.logAuditAction, {
      userId: admin.clerkId,
      targetUserId: targetClerkId,
      action: AUDIT_ACTIONS.USER_PASSWORD_RESET,
      metadata: { sentAt: Date.now() },
    });
  },
});
