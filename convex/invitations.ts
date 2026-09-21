import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import { normalizeEmail } from "../src/lib/email";
import { assertAdmin } from "./lib/auth";
import { AUDIT_ACTIONS } from "../src/lib/constants";

/** Registra una invitación pendiente. Si ya existe una para ese email, es idempotente. */
export const createFromAdmin = internalMutation({
  args: {
    email: v.string(),
    role: v.union(v.literal("user"), v.literal("admin")),
    invitedBy: v.string(),
  },
  handler: async (ctx, args) => {
    // El correo se guarda y se busca SIEMPRE en minúsculas y sin espacios.
    // Antes se guardaba tal cual lo tecleaba el admin y se buscaba con el que
    // entrega el proveedor de identidad: si diferían en mayúsculas, la
    // invitación quedaba pendiente para siempre y su titular no podía entrar.
    const email = normalizeEmail(args.email);

    const existing = await ctx.db
      .query("invitations")
      .withIndex("by_email", (q) => q.eq("email", email))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();
    if (existing) return existing._id;

    return ctx.db.insert("invitations", {
      email,
      role: args.role,
      status: "pending",
      invitedBy: args.invitedBy,
      createdAt: Date.now(),
    });
  },
});

/**
 * Anula una invitación pendiente.
 *
 * Solo se borran las `pending`: una ya aceptada es el registro histórico de
 * cómo entró esa persona, y borrarla no revoca nada —la cuenta ya existe— pero
 * sí destruye la trazabilidad. Para quitar el acceso de alguien que ya entró
 * está desactivar o eliminar su usuario.
 */
export const revoke = mutation({
  args: { invitationId: v.id("invitations") },
  handler: async (ctx, { invitationId }) => {
    const admin = await assertAdmin(ctx);
    const invitation = await ctx.db.get(invitationId);
    if (!invitation) throw new Error("La invitación ya no existe");
    if (invitation.status !== "pending") {
      throw new Error("Esa invitación ya se usó: no se puede revocar");
    }

    await ctx.db.delete(invitationId);

    // Auditoría: mismo patrón que users.updateByAdmin (insert directo), porque
    // internal.users.logAuditAction es una internalMutation y esta es una
    // mutation pública con contexto de admin ya resuelto.
    await ctx.db.insert("auditLogs", {
      userId: admin.clerkId,
      action: AUDIT_ACTIONS.USER_INVITE_REVOKED,
      entity: "invitations",
      entityId: invitationId,
      metadata: { email: invitation.email, role: invitation.role },
      createdAt: Date.now(),
    });
  },
});
