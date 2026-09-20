"use node";
import { internalAction, action } from "../_generated/server";
import { components, internal } from "../_generated/api";
import { v } from "convex/values";
import { AUDIT_ACTIONS } from "../../src/lib/constants";
import { assertAdminFromAction } from "../lib/auth";
import { USER_DATA_TABLES } from "../lib/userData";

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

    // ── Borrado en cascada ────────────────────────────────────────────────
    //
    // Las 15 tablas de datos del usuario se recorren desde USER_DATA_TABLES,
    // que es la misma lista que usa el reset de fábrica y la exportación. Antes
    // había acá una lista escrita a mano de 12 entidades: se le escapaban
    // `goals`, `loans`, `loanRepayments` y `netWorthSnapshots`, que quedaban
    // huérfanas cada vez que un admin borraba un usuario. Un test en
    // convex/lib/__tests__/userData.test.ts impide que vuelva a divergir.
    //
    // El borrado va por lotes por el mismo motivo que en el reset: una sola
    // mutation no aguanta un usuario con muchos movimientos.

    const counts: Record<string, number> = {};

    // Movimientos que otras personas registraron en las cuentas de este
    // usuario. Antes del recorrido de tablas: al borrar `accounts` se pierde
    // el único camino para encontrarlos, y quedarían apuntando a la nada.
    let inOwnedAccounts = 0;
    for (;;) {
      const swept: number = await ctx.runMutation(
        internal.factoryReset.deleteTransactionsInOwnedAccounts,
        { userId: clerkId }
      );
      if (swept === 0) break;
      inOwnedAccounts += swept;
    }
    counts.transactionsInOwnedAccounts = inOwnedAccounts;

    for (const table of USER_DATA_TABLES) {
      let removed = 0;
      for (;;) {
        const { deleted, extra } = await ctx.runMutation(
          internal.factoryReset.deleteBatch,
          { userId: clerkId, table }
        );
        if (extra > 0) {
          counts.sharesOnOwnedAccounts = (counts.sharesOnOwnedAccounts ?? 0) + extra;
        }
        if (deleted === 0) break;
        removed += deleted;
      }
      counts[table] = removed;
    }

    // Notificaciones y suscripciones push: datos que generó la app, fuera de
    // USER_DATA_TABLES porque la exportación tampoco los entrega.
    let generated = 0;
    for (;;) {
      const deleted: number = await ctx.runMutation(
        internal.factoryReset.deleteGeneratedData,
        { userId: clerkId }
      );
      if (deleted === 0) break;
      generated += deleted;
    }
    counts.generated = generated;

    // Sesiones: no son datos del usuario, se borran igual al eliminarlo.
    counts.sessions = await ctx.runMutation(internal.users.deleteEntities, {
      clerkId,
      entity: "sessions",
    });

    // Avatar en Convex Storage
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
