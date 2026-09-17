"use node";
import { internalAction, action } from "../_generated/server";
import { components, internal } from "../_generated/api";
import { v } from "convex/values";
import { AUDIT_ACTIONS } from "../../src/lib/constants";
import { assertAdminFromAction } from "../lib/auth";

/**
 * Acción pública: llamada desde el panel admin.
 * Verifica doble confirmación (el admin ya validó el email del usuario antes de llamar).
 */
export const runByAdmin = action({
  args: {
    targetClerkId: v.string(),
    targetEmail: v.string(),
  },
  handler: async (ctx, { targetClerkId }) => {
    const admin = await assertAdminFromAction(ctx);

    await ctx.runAction(internal.actions.deleteUserCascade.run, {
      clerkId: targetClerkId,
      deletedBy: admin.clerkId,
    });
  },
});

/** Acción interna: hace el borrado real. */
export const run = internalAction({
  args: { clerkId: v.string(), deletedBy: v.string() },
  handler: async (ctx, { clerkId, deletedBy }) => {
    // Obtener info del usuario antes de borrar (para el log)
    const user = await ctx.runQuery(internal.users.getByClerkIdInternal, {
      clerkId,
    });
    if (!user) return; // Ya fue borrado

    // ── Borrado en cascada (orden importante por integridad referencial) ──

    const counts: Record<string, number> = {};

    // 1. Notificaciones
    counts.notifications = await ctx.runMutation(internal.users.deleteEntities, {
      clerkId,
      entity: "notifications",
    });

    // 2. Push subscriptions
    counts.pushSubscriptions = await ctx.runMutation(internal.users.deleteEntities, {
      clerkId,
      entity: "pushSubscriptions",
    });

    // 3. Sessions
    counts.sessions = await ctx.runMutation(internal.users.deleteEntities, {
      clerkId,
      entity: "sessions",
    });

    // 4. Card installments → card purchases → cards
    counts.cardInstallments = await ctx.runMutation(internal.users.deleteEntities, {
      clerkId,
      entity: "cardInstallments",
    });
    counts.cardPurchases = await ctx.runMutation(internal.users.deleteEntities, {
      clerkId,
      entity: "cardPurchases",
    });
    counts.cards = await ctx.runMutation(internal.users.deleteEntities, {
      clerkId,
      entity: "cards",
    });

    // 5. Debt payments → debts
    counts.debtPayments = await ctx.runMutation(internal.users.deleteEntities, {
      clerkId,
      entity: "debtPayments",
    });
    counts.debts = await ctx.runMutation(internal.users.deleteEntities, {
      clerkId,
      entity: "debts",
    });

    // 6. Transacciones (archivos adjuntos se limpian aparte en Convex Files)
    counts.transactions = await ctx.runMutation(internal.users.deleteEntities, {
      clerkId,
      entity: "transactions",
    });

    // 7. Presupuestos y categorías
    counts.budgets = await ctx.runMutation(internal.users.deleteEntities, {
      clerkId,
      entity: "budgets",
    });
    counts.recurringTransactions = await ctx.runMutation(
      internal.users.deleteEntities,
      { clerkId, entity: "recurringTransactions" }
    );
    counts.categories = await ctx.runMutation(internal.users.deleteEntities, {
      clerkId,
      entity: "categories",
    });

    // 8. Account shares donde el usuario es invitado
    counts.accountSharesAsGuest = await ctx.runMutation(
      internal.users.deleteAccountSharesAsGuest,
      { clerkId }
    );

    // 9. Cuentas propias + sus shares
    counts.accountsAndShares = await ctx.runMutation(
      internal.users.deleteOwnedAccounts,
      { clerkId }
    );

    // 10. Avatar en Convex Storage
    await ctx.runMutation(internal.users.deleteAvatarFileInternal, { clerkId });

    // 11. Audit log ANTES de borrar el user doc
    await ctx.runMutation(internal.users.logAuditAction, {
      userId: deletedBy,
      targetUserId: clerkId,
      action: AUDIT_ACTIONS.USER_DELETED,
      metadata: { email: user.email, name: user.name, counts },
    });

    // 12. Eliminar el registro de Better Auth (sesiones, cuentas de login y el
    // propio usuario), si es que ya inició sesión bajo Better Auth alguna vez.
    // No hay endpoint de auth.api para "borrar a cualquier usuario por id"
    // (el `/delete-user` de Better Auth es autoservicio, requiere la sesión
    // del propio usuario) — se usa el adapter genérico del componente
    // directamente. Se captura cualquier error para no dejar al usuario a
    // medio borrar: el resto de la cascada (paso 12) debe completarse igual.
    if (user.authId) {
      try {
        await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
          input: {
            model: "session",
            where: [{ field: "userId", operator: "eq", value: user.authId }],
          },
          paginationOpts: { cursor: null, numItems: 200 },
        });
        await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
          input: {
            model: "account",
            where: [{ field: "userId", operator: "eq", value: user.authId }],
          },
          paginationOpts: { cursor: null, numItems: 200 },
        });
        await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
          input: {
            model: "user",
            where: [{ field: "_id", operator: "eq", value: user.authId }],
          },
        });
      } catch (err) {
        console.error(
          `deleteUserCascade: no se pudo borrar el registro de Better Auth de ${clerkId} (authId ${user.authId}):`,
          err
        );
      }
    }

    // 13. Eliminar el documento de usuario
    await ctx.runMutation(internal.users.deleteByClerkId, {
      clerkId,
      deletedBy,
    });

    console.log(
      `deleteUserCascade: usuario ${clerkId} eliminado. Conteos:`,
      counts
    );
  },
});
