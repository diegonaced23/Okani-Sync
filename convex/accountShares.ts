import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser, getCurrentUserId } from "./lib/auth";
import { assertCanManage, assertIsOwner } from "./lib/permissions";
import { AUDIT_ACTIONS } from "../src/lib/constants";
import { internal } from "./_generated/api";

// ─── Queries ──────────────────────────────────────────────────────────────────

/** Shares activos de una cuenta (solo el owner o admin de la cuenta puede verlos). */
export const listForAccount = query({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    const clerkId = await getCurrentUserId(ctx);
    const account = await ctx.db.get(accountId);
    if (!account || account.ownerId !== clerkId) return [];

    const shares = await ctx.db
      .query("accountShares")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "pendiente"),
          q.eq(q.field("status"), "aceptada")
        )
      )
      .collect();

    // Enriquecer con datos del usuario invitado
    return await Promise.all(
      shares.map(async (share) => {
        const user = await ctx.db
          .query("users")
          .withIndex("by_clerkId", (q) => q.eq("clerkId", share.sharedWithUserId))
          .unique();
        return { ...share, userName: user?.name, userEmail: user?.email };
      })
    );
  },
});

/** Invitaciones pendientes para el usuario actual. */
export const listMyPendingInvitations = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await getCurrentUserId(ctx);
    const shares = await ctx.db
      .query("accountShares")
      .withIndex("by_shared_user_status", (q) =>
        q.eq("sharedWithUserId", clerkId).eq("status", "pendiente")
      )
      .collect();

    return await Promise.all(
      shares.map(async (share) => {
        const account = await ctx.db.get(share.accountId);
        const owner = await ctx.db
          .query("users")
          .withIndex("by_clerkId", (q) => q.eq("clerkId", share.ownerId))
          .unique();
        return { ...share, accountName: account?.name, ownerName: owner?.name };
      })
    );
  },
});

/** Cuentas que otros compartieron conmigo (shares aceptados). */
export const listMyActiveShares = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await getCurrentUserId(ctx);
    const shares = await ctx.db
      .query("accountShares")
      .withIndex("by_shared_user_status", (q) =>
        q.eq("sharedWithUserId", clerkId).eq("status", "aceptada")
      )
      .collect();

    return await Promise.all(
      shares.map(async (share) => {
        const account = await ctx.db.get(share.accountId);
        const owner = await ctx.db
          .query("users")
          .withIndex("by_clerkId", (q) => q.eq("clerkId", share.ownerId))
          .unique();
        return { ...share, account, ownerName: owner?.name };
      })
    );
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

/** El dueño (o admin de la cuenta) invita a un usuario por email. */
export const share = mutation({
  args: {
    accountId: v.id("accounts"),
    email: v.string(),
    permission: v.union(
      v.literal("viewer"),
      v.literal("editor"),
      v.literal("admin")
    ),
  },
  handler: async (ctx, { accountId, email, permission }) => {
    const currentUser = await getCurrentUser(ctx);
    await assertCanManage(ctx, accountId);

    // Validación de formato de email antes de cualquier consulta a BD
    const normalizedEmail = email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new Error("El formato del correo electrónico no es válido");
    }

    // Rate limiting: máximo 10 invitaciones por minuto por usuario
    const recentShares = await ctx.db
      .query("accountShares")
      .withIndex("by_owner", (q) => q.eq("ownerId", currentUser.clerkId))
      .order("desc")
      .take(11);
    const cutoff = Date.now() - 60_000;
    if (recentShares.filter((s) => s.invitedAt >= cutoff).length >= 10) {
      throw new Error("Demasiadas invitaciones en poco tiempo. Intenta de nuevo en un minuto.");
    }

    // Buscar usuario invitado por email
    const invitedUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .unique();

    // Mensaje genérico para no revelar si un email está registrado en el sistema
    if (!invitedUser) {
      throw new Error(
        "No se pudo completar la invitación. Verifica el correo e intenta de nuevo."
      );
    }
    if (invitedUser.clerkId === currentUser.clerkId) {
      throw new Error("No puedes compartir una cuenta contigo mismo");
    }

    const account = await ctx.db.get(accountId);
    if (!account) throw new Error("Cuenta no encontrada");
    if (account.ownerId === invitedUser.clerkId) {
      throw new Error("Este usuario ya es el dueño de la cuenta");
    }

    // Verificar que no exista un share activo/pendiente
    const existing = await ctx.db
      .query("accountShares")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .filter((q) =>
        q.and(
          q.eq(q.field("sharedWithUserId"), invitedUser.clerkId),
          q.or(
            q.eq(q.field("status"), "pendiente"),
            q.eq(q.field("status"), "aceptada")
          )
        )
      )
      .unique();

    if (existing) {
      throw new Error(
        existing.status === "pendiente"
          ? "Ya existe una invitación pendiente para este usuario"
          : "Este usuario ya tiene acceso a la cuenta"
      );
    }

    const shareId = await ctx.db.insert("accountShares", {
      accountId,
      ownerId: currentUser.clerkId,
      sharedWithUserId: invitedUser.clerkId,
      permission,
      status: "pendiente",
      invitedAt: Date.now(),
    });

    await ctx.db.insert("auditLogs", {
      userId: currentUser.clerkId,
      targetUserId: invitedUser.clerkId,
      action: AUDIT_ACTIONS.ACCOUNT_SHARED,
      entity: "accountShares",
      entityId: shareId,
      metadata: { accountId, permission, accountName: account.name },
      createdAt: Date.now(),
    });

    // Notificación in-app para el invitado
    await ctx.db.insert("notifications", {
      userId: invitedUser.clerkId,
      type: "cuenta_compartida",
      title: "Nueva invitación de cuenta compartida",
      message: `${currentUser.name} te invitó a la cuenta "${account.name}" con permiso ${permission}.`,
      read: false,
      pushSent: false,
      actionUrl: "/cuentas/compartidas",
      relatedEntityId: shareId,
      createdAt: Date.now(),
    });

    // Push inmediato al usuario invitado
    await ctx.scheduler.runAfter(0, internal.actions.sendPushNotification.run, {
      userId: invitedUser.clerkId,
      title: "📬 Invitación de cuenta compartida",
      body: `${currentUser.name} te invitó a la cuenta "${account.name}".`,
      url: "/cuentas/compartidas",
    });

    return shareId;
  },
});

/** El usuario invitado acepta o rechaza la invitación. */
export const respondToInvitation = mutation({
  args: {
    shareId: v.id("accountShares"),
    accept: v.boolean(),
  },
  handler: async (ctx, { shareId, accept }) => {
    const clerkId = await getCurrentUserId(ctx);
    const share = await ctx.db.get(shareId);

    if (!share || share.sharedWithUserId !== clerkId) {
      throw new Error("Invitación no encontrada");
    }
    if (share.status !== "pendiente") {
      throw new Error("Esta invitación ya fue respondida");
    }

    const newStatus = accept ? "aceptada" : "rechazada";
    await ctx.db.patch(shareId, {
      status: newStatus,
      respondedAt: Date.now(),
    });

    // Si acepta, marcar la cuenta como compartida
    if (accept) {
      await ctx.db.patch(share.accountId, { isShared: true, updatedAt: Date.now() });

      // Notificar al dueño
      const account = await ctx.db.get(share.accountId);
      const me = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
        .unique();

      await ctx.db.insert("notifications", {
        userId: share.ownerId,
        type: "share_aceptado",
        title: "Invitación aceptada",
        message: `${me?.name ?? "Un usuario"} aceptó acceso a "${account?.name}".`,
        read: false,
        pushSent: false,
        actionUrl: `/cuentas/${share.accountId}`,
        relatedEntityId: shareId,
        createdAt: Date.now(),
      });

      // Push inmediato al dueño
      await ctx.scheduler.runAfter(0, internal.actions.sendPushNotification.run, {
        userId: share.ownerId,
        title: "✅ Invitación aceptada",
        body: `${me?.name ?? "Un usuario"} aceptó acceso a "${account?.name ?? "la cuenta"}".`,
        url: `/cuentas/${share.accountId}`,
      });

      await ctx.db.insert("auditLogs", {
        userId: clerkId,
        action: AUDIT_ACTIONS.ACCOUNT_SHARE_ACCEPTED,
        entity: "accountShares",
        entityId: shareId,
        createdAt: Date.now(),
      });
    } else {
      await ctx.db.insert("auditLogs", {
        userId: clerkId,
        action: AUDIT_ACTIONS.ACCOUNT_SHARE_REJECTED,
        entity: "accountShares",
        entityId: shareId,
        createdAt: Date.now(),
      });
    }
  },
});

/** El dueño revoca el acceso de un usuario. */
export const revoke = mutation({
  args: { shareId: v.id("accountShares") },
  handler: async (ctx, { shareId }) => {
    const currentUser = await getCurrentUser(ctx);
    const share = await ctx.db.get(shareId);

    if (!share) throw new Error("Share no encontrado");
    await assertIsOwner(ctx, share.accountId);

    await ctx.db.patch(shareId, { status: "revocada", revokedAt: Date.now() });

    // Recalcular isShared: verificar si quedan otros shares aceptados
    const remaining = await ctx.db
      .query("accountShares")
      .withIndex("by_account", (q) => q.eq("accountId", share.accountId))
      .filter((q) => q.eq(q.field("status"), "aceptada"))
      .first();

    if (!remaining) {
      await ctx.db.patch(share.accountId, { isShared: false, updatedAt: Date.now() });
    }

    await ctx.db.insert("auditLogs", {
      userId: currentUser.clerkId,
      targetUserId: share.sharedWithUserId,
      action: AUDIT_ACTIONS.ACCOUNT_SHARE_REVOKED,
      entity: "accountShares",
      entityId: shareId,
      createdAt: Date.now(),
    });
  },
});

/** El usuario invitado sale voluntariamente de una cuenta compartida. */
export const leaveSharedAccount = mutation({
  args: { shareId: v.id("accountShares") },
  handler: async (ctx, { shareId }) => {
    const clerkId = await getCurrentUserId(ctx);
    const share = await ctx.db.get(shareId);

    if (!share || share.sharedWithUserId !== clerkId) {
      throw new Error("Share no encontrado");
    }

    await ctx.db.patch(shareId, { status: "revocada", revokedAt: Date.now() });

    const remaining = await ctx.db
      .query("accountShares")
      .withIndex("by_account", (q) => q.eq("accountId", share.accountId))
      .filter((q) => q.eq(q.field("status"), "aceptada"))
      .first();

    if (!remaining) {
      await ctx.db.patch(share.accountId, { isShared: false, updatedAt: Date.now() });
    }
  },
});

/** Actualiza el nivel de permiso de un share existente. */
export const updatePermission = mutation({
  args: {
    shareId: v.id("accountShares"),
    permission: v.union(
      v.literal("viewer"),
      v.literal("editor"),
      v.literal("admin")
    ),
  },
  handler: async (ctx, { shareId, permission }) => {
    const share = await ctx.db.get(shareId);
    if (!share) throw new Error("Share no encontrado");
    await assertIsOwner(ctx, share.accountId);
    await ctx.db.patch(shareId, { permission });
  },
});
