import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import { assertAdmin } from "./lib/auth";

/**
 * Claves de `metadata` que pueden salir de Convex hacia el panel.
 *
 * `auditLogs.metadata` está tipado como `v.any()` y cada llamador mete lo que
 * necesita. Varios meten datos financieros de un usuario: `accounts.ts`
 * escribe `previousBalance`, `newBalance` y `delta` en la reasignación y la
 * corrección de saldo, y `accountShares.ts` escribe `accountName`. Devolver la
 * fila entera mandaba todo eso al navegador del administrador aunque la
 * interfaz no lo pintara — y la ficha de usuario SÍ lo pinta, con un
 * `JSON.stringify(log.metadata)` crudo.
 *
 * La regla del panel es dura: agregados y metadatos, nunca datos financieros
 * de nadie. Por eso esto es una lista BLANCA y no una negra: una clave nueva
 * en cualquier `insert` de `auditLogs` queda fuera por defecto, en vez de
 * filtrarse hasta que alguien se acuerde de añadirla a una lista de exclusión.
 *
 * - `email`, `role`, `name`: identifican al sujeto de una acción
 *   administrativa (invitaciones, altas, cambios de rol). No son financieros.
 * - `fromCurrency`, `toCurrency`, `rate`: el par y la tasa de
 *   `exchange_rate.set_manual`. `currentExchangeRates` es una tabla GLOBAL de
 *   la app, no el dinero de nadie; sin estas claves la única acción
 *   administrativa que toca la consolidación de todos aparecería en el feed
 *   sin decir qué se cambió.
 */
const METADATA_KEYS_PERMITIDAS = [
  "email",
  "role",
  "name",
  "fromCurrency",
  "toCurrency",
  "rate",
] as const;

/**
 * Deja pasar solo las claves de la lista blanca. Se aplica en las DOS queries
 * (el feed del panel y el historial de la ficha) desde un único sitio, para
 * que no puedan divergir.
 */
function sanearMetadata(metadata: unknown): Record<string, unknown> | undefined {
  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }
  const origen = metadata as Record<string, unknown>;
  const limpio: Record<string, unknown> = {};
  for (const clave of METADATA_KEYS_PERMITIDAS) {
    if (origen[clave] !== undefined) limpio[clave] = origen[clave];
  }
  // `undefined` y no `{}`: la interfaz ya distingue "sin metadata" y así no
  // pinta un `{}` vacío para una acción cuyas claves se descartaron enteras.
  return Object.keys(limpio).length > 0 ? limpio : undefined;
}

/** Proyección común: la fila entera menos la metadata cruda. */
function proyectar(log: Doc<"auditLogs">) {
  return {
    _id: log._id,
    _creationTime: log._creationTime,
    userId: log.userId,
    targetUserId: log.targetUserId,
    action: log.action,
    entity: log.entity,
    entityId: log.entityId,
    metadata: sanearMetadata(log.metadata),
    createdAt: log.createdAt,
  };
}

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 50 }) => {
    await assertAdmin(ctx);
    const logs = await ctx.db.query("auditLogs").order("desc").take(limit);
    return logs.map(proyectar);
  },
});

export const listForUser = query({
  args: { targetClerkId: v.string() },
  handler: async (ctx, { targetClerkId }) => {
    await assertAdmin(ctx);
    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_target", (q) => q.eq("targetUserId", targetClerkId))
      .order("desc")
      .collect();
    return logs.map(proyectar);
  },
});
