/**
 * Restablecimiento de datos de fábrica: el usuario borra TODOS sus datos y
 * deja la cuenta como recién creada, conservando su identidad y su sesión.
 *
 * Arriba están las piezas que tocan la base de datos; abajo, la action `run`
 * que las encadena. El punto de entrada desde la interfaz es `run`.
 */

import { action, internalMutation, internalQuery, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { AUDIT_ACTIONS, FACTORY_RESET_PHRASE } from "../src/lib/constants";
import { getCurrentUser, getCurrentUserFromAction } from "./lib/auth";
import { USER_DATA_TABLES, collectUserDocs, type UserDataTable } from "./lib/userData";
import { seedInitialUserData, FACTORY_PROFILE } from "./lib/seedUserData";

/** Tope de filas que se cuentan por tabla en la vista previa. */
const PREVIEW_CAP = 1000;

/** Filas que se borran por lote. Mantiene cada mutation dentro de los límites. */
export const DELETE_BATCH_SIZE = 200;

const tableValidator = v.union(
  ...(USER_DATA_TABLES.map((t) => v.literal(t)) as [
    ReturnType<typeof v.literal<UserDataTable>>,
    ...ReturnType<typeof v.literal<UserDataTable>>[],
  ]),
);

/**
 * Cuántas filas se van a borrar, por tabla. Alimenta el primer paso de la
 * confirmación: ver "1.284 movimientos" frena mucho más que un texto genérico.
 *
 * Se cuenta con tope porque contar de verdad obligaría a leer la tabla entera.
 * Cuando una tabla llega al tope, `capped` queda en true y la UI muestra "1000+".
 */
export const getResetPreview = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);

    const counts: Record<string, number> = {};
    let capped = false;
    let total = 0;

    for (const table of USER_DATA_TABLES) {
      const docs = await collectUserDocs(ctx, table, user.clerkId, PREVIEW_CAP);
      counts[table] = docs.length;
      total += docs.length;
      if (docs.length >= PREVIEW_CAP) capped = true;
    }

    // Movimientos que otra persona registró en las cuentas del usuario. Se
    // cuentan aparte porque también se borran, y porque es la única cifra del
    // resumen que representa datos AJENOS: el diálogo debe poder avisarlo en
    // vez de esconderlo dentro del total.
    const foreignTransactions = await countForeignTransactions(ctx, user.clerkId);
    total += foreignTransactions;

    return { counts, total, capped, foreignTransactions };
  },
});

/**
 * Igual que la anterior pero para la action, que no puede leer la BD directo.
 * Incluye `transactionsInOwnedAccounts` para que el log de auditoría registre
 * también lo ajeno que se borró, no solo lo propio.
 */
export const getResetPreviewInternal = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const counts: Record<string, number> = {};
    for (const table of USER_DATA_TABLES) {
      counts[table] = (await collectUserDocs(ctx, table, userId, PREVIEW_CAP)).length;
    }
    counts.transactionsInOwnedAccounts = await countForeignTransactions(ctx, userId);
    return counts;
  },
});

/**
 * Movimientos que viven en las cuentas de `userId` pero registró otra persona.
 * Los comparten la vista previa y el log de auditoría, así que va en un helper
 * para que las dos cifras no puedan discrepar.
 */
async function countForeignTransactions(ctx: QueryCtx, userId: string): Promise<number> {
  const owned = await ctx.db
    .query("accounts")
    .withIndex("by_owner", (q) => q.eq("ownerId", userId))
    .collect();

  let count = 0;
  for (const account of owned) {
    const txs = await ctx.db
      .query("transactions")
      .withIndex("by_account", (q) => q.eq("accountId", account._id))
      .take(PREVIEW_CAP);
    count += txs.filter((t) => t.userId !== userId).length;
  }
  return count;
}

/**
 * Borra un lote de una tabla y devuelve cuántas filas quitó. La action llama
 * en bucle hasta que devuelve 0.
 *
 * En `transactions` borra además el recibo adjunto en `_storage`. Nadie lo
 * hacía: `deleteUserCascade` lo reconocía en un comentario y dejaba los
 * archivos huérfanos, ocupando espacio para siempre sin fila que los apunte.
 */
export const deleteBatch = internalMutation({
  args: { userId: v.string(), table: tableValidator },
  handler: async (ctx, { userId, table }): Promise<{ deleted: number; extra: number }> => {
    const ids = await collectUserDocs(ctx, table, userId, DELETE_BATCH_SIZE);
    let extra = 0;

    // Los shares de una cuenta se borran junto con la cuenta, por `by_account`.
    //
    // No basta con los que encuentra `collectUserDocs`: `accountShares.ownerId`
    // es QUIEN CREÓ el share, no el dueño de la cuenta, y `assertCanManage`
    // deja crear shares a un colaborador con permiso "admin". Así que si A
    // comparte su cuenta con B como admin y B se la comparte a C, esa fila
    // tiene ownerId = B. Buscando solo por ownerId y sharedWithUserId, al
    // resetear A esa fila sobreviviría a la cuenta y le daría a C acceso a algo
    // que ya no existe.
    if (table === "accounts") {
      for (const id of ids) {
        const accountId = id as import("./_generated/dataModel").Id<"accounts">;
        const shares = await ctx.db
          .query("accountShares")
          .withIndex("by_account", (q) => q.eq("accountId", accountId))
          .collect();
        await Promise.all(shares.map((s) => ctx.db.delete(s._id)));
        extra += shares.length;
      }
    }

    if (table === "transactions") {
      for (const id of ids) {
        const tx = await ctx.db.get(id as never as import("./_generated/dataModel").Id<"transactions">);
        if (tx?.receiptStorageId) {
          // Un recibo que ya no está no debe abortar el borrado del resto.
          try {
            await ctx.storage.delete(tx.receiptStorageId);
          } catch (err) {
            console.error(`factoryReset: no se pudo borrar el recibo de ${String(id)}:`, err);
          }
        }
      }
    }

    await Promise.all(ids.map((id) => ctx.db.delete(id)));

    // Se devuelven por separado: `deleted` es lo que controla el bucle (parar
    // cuando ya no queda nada de esta tabla) y `extra` son filas de OTRA tabla
    // que se arrastraron. Sumarlas en un solo número dejaría un log de
    // auditoría que dice "accounts: 14" cuando el usuario tenía 6 cuentas.
    // `extra` solo puede ser >0 si `deleted` lo es, así que el bucle termina.
    return { deleted: ids.length, extra };
  },
});

/**
 * Borra los movimientos que viven en las cuentas del usuario pero que registró
 * otra persona.
 *
 * Hace falta porque `transactions.userId` es QUIEN CREÓ el movimiento, no el
 * dueño de la cuenta: en una cuenta compartida, lo que apunta un colaborador
 * lleva su userId. Sin este barrido, al resetear el dueño desaparecería la
 * cuenta y esas filas quedarían apuntando a un `accountId` inexistente —
 * visibles para el colaborador y rotas.
 *
 * Va acotado por `DELETE_BATCH_SIZE` en total (no por cuenta) para que una
 * cuenta con muchos movimientos no desborde la mutation. La action lo llama en
 * bucle, y ANTES de tocar la tabla `accounts`: cuando la cuenta ya no existe
 * no hay forma de encontrar lo que colgaba de ella.
 */
export const deleteTransactionsInOwnedAccounts = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const accounts = await ctx.db
      .query("accounts")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .collect();

    let budget = DELETE_BATCH_SIZE;

    for (const account of accounts) {
      if (budget <= 0) break;
      const txs = await ctx.db
        .query("transactions")
        .withIndex("by_account", (q) => q.eq("accountId", account._id))
        .take(budget);

      for (const tx of txs) {
        if (tx.receiptStorageId) {
          try {
            await ctx.storage.delete(tx.receiptStorageId);
          } catch (err) {
            console.error(`factoryReset: no se pudo borrar el recibo de ${tx._id}:`, err);
          }
        }
      }
      await Promise.all(txs.map((t) => ctx.db.delete(t._id)));
      budget -= txs.length;
    }

    return DELETE_BATCH_SIZE - budget;
  },
});

/**
 * Borra lo que la app generó para el usuario: avisos, suscripciones push y su
 * fila de `userStats`.
 *
 * Va aparte de USER_DATA_TABLES a propósito — esa lista es "los datos del
 * usuario", los mismos que entrega la exportación, y estos tres no salen ahí.
 *
 * `userStats` se suma aquí y no a USER_DATA_TABLES porque, igual que
 * `notifications`/`pushSubscriptions`, no es algo que el usuario introdujo:
 * es un contador que calcula `adminStats.recomputeForUser`. Pero a diferencia
 * de esos dos, nadie la borraba: sobrevivía tanto a un usuario eliminado (fila
 * huérfana que `adminStats.getTotals` sigue sumando para siempre) como a un
 * reset de fábrica (fila con los contadores de ANTES del reset, mintiendo
 * sobre datos que ya no existen). `by_user` es único por diseño —
 * `recomputeForUser` hace `.unique()` antes de escribir— así que hay a lo
 * sumo una fila que borrar.
 *
 * Esta función la llaman los dos únicos caminos de borrado del repo
 * (`convex/actions/deleteUserCascade.ts::run` y `factoryReset.run` de este
 * archivo), así que un solo cambio aquí cierra la fuga en ambos.
 */
export const deleteGeneratedData = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(DELETE_BATCH_SIZE);
    await Promise.all(notifications.map((n) => ctx.db.delete(n._id)));

    const subs = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(DELETE_BATCH_SIZE);
    await Promise.all(subs.map((s) => ctx.db.delete(s._id)));

    // A lo sumo una fila (índice `by_user`, y `recomputeForUser` mantiene la
    // unicidad con `.unique()` antes de escribir). Se busca en cada llamada
    // del bucle igual que las otras dos consultas: cuando ya no hay nada que
    // borrar, esta también devuelve 0 y el bucle de la action puede parar.
    const stats = await ctx.db
      .query("userStats")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (stats) await ctx.db.delete(stats._id);

    return notifications.length + subs.length + (stats ? 1 : 0);
  },
});

/**
 * Deja el perfil y el contenido inicial como en una cuenta nueva.
 *
 * Solo debe llamarse cuando ya no queda nada que borrar: `seedInitialUserData`
 * asume que el usuario no tiene ni cuentas ni categorías.
 */
export const restoreFactoryState = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
      .unique();
    if (!user) throw new Error("Usuario no encontrado");

    const now = Date.now();

    await ctx.db.patch(user._id, {
      locale: FACTORY_PROFILE.locale,
      currency: FACTORY_PROFILE.currency,
      theme: FACTORY_PROFILE.theme,
      // `undefined` significa "todas las familias activas", que es el estado
      // con el que nace una cuenta. Ver convex/lib/notify.ts.
      notificationPrefs: undefined,
      updatedAt: now,
    });

    await seedInitialUserData(ctx, userId, now);
  },
});

// ─── Orquestación ─────────────────────────────────────────────────────────────
//
// `run` es una action y no una mutation porque el borrado va por lotes: una
// sola mutation que intentara borrar todos los movimientos de un usuario activo
// excedería los límites de lectura y tiempo de Convex. La action encadena
// mutations pequeñas hasta vaciar cada tabla.
//
// Vive en este archivo y no en `convex/actions/` porque esa carpeta está
// deprecada en Convex: fuerza el runtime de Node y exige "use node" en todo lo
// que contiene. Esta action no necesita Node, así que corre en el runtime V8.
//
// Consecuencia de ir por lotes: al no ser una única transacción, si el proceso
// se cae a la mitad el usuario queda con parte de sus datos borrados. Por eso
// el orden de USER_DATA_TABLES va de hijas a padres —lo que quede será
// coherente— y por eso volver a lanzarla continúa donde se quedó.

/**
 * Cota de seguridad del bucle por tabla. Con lotes de 200, deja margen para
 * 2 millones de filas en una sola tabla antes de rendirse; que se alcance
 * significa que algo va mal —una fila que no se borra y se relee sin fin— y
 * es preferible cortar que girar para siempre consumiendo cuota.
 */
const MAX_BATCHES_PER_TABLE = 10_000;

export const run = action({
  args: { confirmation: v.string() },
  handler: async (
    ctx,
    { confirmation },
  ): Promise<{ counts: Record<string, number>; total: number }> => {
    const user = await getCurrentUserFromAction(ctx);

    // La confirmación se revalida en el servidor a propósito. Una action de
    // Convex es un endpoint público: si la única barrera fuera el input
    // deshabilitado de la interfaz, bastaría una llamada directa con la sesión
    // del usuario para vaciarle la cuenta sin que él tocara nada.
    if (confirmation !== FACTORY_RESET_PHRASE) {
      throw new Error("Confirmación incorrecta: el restablecimiento no se ejecutó.");
    }

    // Se toman los conteos ANTES de borrar: después ya no hay nada que contar,
    // y son lo que queda registrado en el log de auditoría.
    const counts: Record<string, number> = await ctx.runQuery(
      internal.factoryReset.getResetPreviewInternal,
      { userId: user.clerkId },
    );

    let total = 0;

    // Primero lo que cuelga de las cuentas del usuario pero registró otra
    // persona. Tiene que ir ANTES del recorrido de tablas: cuando `accounts`
    // desaparece ya no queda por dónde encontrarlo.
    for (let batches = 0; ; batches++) {
      const swept: number = await ctx.runMutation(
        internal.factoryReset.deleteTransactionsInOwnedAccounts,
        { userId: user.clerkId },
      );
      if (swept === 0) break;
      // Solo se acumula en `total`. `counts` ya trae esta cifra de la vista
      // previa tomada antes de borrar, y sumarle lo barrido la duplicaría.
      total += swept;
      if (batches >= MAX_BATCHES_PER_TABLE) {
        throw new Error(
          "factoryReset: los movimientos de las cuentas propias no terminan de vaciarse.",
        );
      }
    }

    for (const table of USER_DATA_TABLES) {
      let batches = 0;
      for (;;) {
        const { deleted, extra } = await ctx.runMutation(
          internal.factoryReset.deleteBatch,
          { userId: user.clerkId, table },
        );
        total += deleted + extra;
        // Shares que colgaban de las cuentas del usuario pero que creó otra
        // persona. Van al log aparte para que el recuento por tabla no mienta.
        if (extra > 0) counts.sharesOnOwnedAccounts = (counts.sharesOnOwnedAccounts ?? 0) + extra;
        if (deleted === 0) break;
        if (++batches >= MAX_BATCHES_PER_TABLE) {
          throw new Error(
            `factoryReset: '${table}' no termina de vaciarse tras ${batches} lotes. ` +
              `Se aborta para no girar indefinidamente; revisar la tabla a mano.`,
          );
        }
      }
    }

    // Avisos, suscripciones push y la fila de `userStats`, que no forman
    // parte de USER_DATA_TABLES.
    for (let batches = 0; ; batches++) {
      const deleted: number = await ctx.runMutation(
        internal.factoryReset.deleteGeneratedData,
        { userId: user.clerkId },
      );
      total += deleted;
      if (deleted === 0) break;
      if (batches >= MAX_BATCHES_PER_TABLE) {
        throw new Error("factoryReset: los datos generados no terminan de vaciarse.");
      }
    }

    // Recién ahora se repone el estado inicial: sembrar antes de terminar de
    // borrar dejaría la cuenta Billetera y las categorías nuevas dentro del
    // propio barrido.
    await ctx.runMutation(internal.factoryReset.restoreFactoryState, {
      userId: user.clerkId,
    });

    // El reset es distinto del borrado de usuario en un punto clave: aquí el
    // usuario SIGUE existiendo, así que el panel admin puede volver a
    // preguntar por sus contadores en cualquier momento. `deleteGeneratedData`
    // ya quitó su fila de `userStats` (ver el comentario de esa función), y
    // dejarlo así hasta el `recomputeAll` de las 03:00 UTC sería honesto —el
    // panel mostraría "sin calcular" en vez de mentir con los contadores de
    // ANTES del reset— pero deja al usuario recién resetado horas apareciendo
    // como un signo de interrogación en vez de con los ceros (y el par de
    // filas que siembra `seedInitialUserData`) que de verdad tiene.
    //
    // La alternativa —encolar el recálculo ya mismo— es igual de honesta en
    // cuanto termina, así que se elige por ser mejor experiencia sin costar
    // exactitud, CON una condición: tiene que encolarse DESPUÉS de sembrar,
    // no antes. `recomputeForUser` encadena sus quince pasos por
    // `ctx.scheduler.runAfter(0, …)`, así que si se lanzara antes de que
    // `restoreFactoryState` (arriba) termine de crear la cuenta Billetera y
    // las categorías por defecto, podría contarlas a medio sembrar y dejar
    // una fila que ya está desactualizada en el instante en que se escribe —
    // exactamente la mentira que se quiere evitar. Encolado aquí, después de
    // que el `await` de arriba ya resolvió, mira un estado quieto.
    await ctx.runMutation(internal.adminStats.recomputeForUser, {
      userId: user.clerkId,
    });

    await ctx.runMutation(internal.users.logAuditAction, {
      userId: user.clerkId,
      targetUserId: user.clerkId,
      action: AUDIT_ACTIONS.USER_DATA_RESET,
      metadata: { email: user.email, counts },
    });

    return { counts, total };
  },
});
