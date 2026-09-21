/**
 * Contadores agregados del panel de administración.
 *
 * Se materializan por recálculo: ver la decisión razonada en
 * docs/superpowers/specs/2026-09-20-modulo-admin-design.md.
 */

import { action, internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { assertAdmin, assertAdminFromAction } from "./lib/auth";
import { USER_DATA_TABLES, countUserDocs } from "./lib/userData";
import { STATS_COUNT_CAP } from "../src/lib/constants";

/**
 * Recálculo de los contadores de UN usuario, UNA tabla por transacción.
 *
 * Por qué encadenado y no un solo bucle sobre las quince tablas: una
 * transacción de Convex puede escanear como mucho **32 000 documentos** y leer
 * **16 MiB** (https://docs.convex.dev/production/state/limits). La versión
 * anterior recorría las quince tablas con tope de 10 000 cada una dentro de una
 * sola mutation —hasta 150 000 documentos, y `collectUserDocs` trae el
 * documento ENTERO, no solo el id—, así que un usuario con muchos datos hacía
 * que la mutation lanzara y se quedaba con los contadores viejos y sin
 * explicación. El estado «10 000+» que el panel sabe pintar era, de hecho,
 * inalcanzable.
 *
 * La alternativa era bajar el tope, pero el peor caso son 16 lecturas por
 * usuario (`accountShares` consulta dos índices), así que el tope seguro
 * queda en ~1 000 y cualquiera con tres años de movimientos aparecería como
 * «1.000+»: el panel perdería precisión justo donde importa. Troceando, cada
 * salto lee como mucho `STATS_COUNT_CAP` documentos de UNA tabla —10 000, muy
 * por debajo de 32 000— y el tope sigue significando lo que dice.
 *
 * El acumulado viaja en los argumentos y la fila se escribe UNA sola vez, en
 * el último salto: así no hay estados intermedios en los que la mitad de los
 * contadores sean nuevos y la otra mitad viejos, y `computedAt` marca cuándo
 * terminó de verdad.
 */
export const recomputeForUser = internalMutation({
  args: {
    userId: v.string(),
    /** Índice en `USER_DATA_TABLES` de la tabla que toca contar. */
    step: v.optional(v.number()),
    /** Acumulado de los saltos anteriores. */
    counts: v.optional(v.record(v.string(), v.number())),
    capped: v.optional(v.boolean()),
  },
  // Anotación de retorno obligatoria: el handler se referencia a sí mismo a
  // través de `internal.adminStats.recomputeForUser`, cuyo tipo sale de
  // `api.d.ts`, que a su vez declara el tipo de este módulo. Sin cortar el
  // ciclo aquí, TypeScript cae en TS7022/TS7023 (mismo patrón que
  // `convex/admin.ts::getOverview` ya documenta).
  handler: async (ctx, args): Promise<void> => {
    const step = args.step ?? 0;
    const counts: Record<string, number> = { ...(args.counts ?? {}) };
    let capped = args.capped ?? false;

    const table = USER_DATA_TABLES[step];
    // Fuera de rango solo puede ocurrir si alguien invoca la mutation a mano
    // con un `step` inventado; se corta en vez de escribir una fila a medias.
    if (table === undefined) return;

    const n = await countUserDocs(ctx, table, args.userId, STATS_COUNT_CAP);
    counts[table] = n;
    if (n >= STATS_COUNT_CAP) capped = true;

    const siguiente = step + 1;
    if (siguiente < USER_DATA_TABLES.length) {
      await ctx.scheduler.runAfter(0, internal.adminStats.recomputeForUser, {
        userId: args.userId,
        step: siguiente,
        counts,
        capped,
      });
      return;
    }

    // Última tabla: se escribe la fila. Antes se comprueba que el usuario siga
    // existiendo — la cadena dura varias transacciones y un borrado en cascada
    // en medio dejaría un `userStats` huérfano que el panel no sabría a quién
    // atribuir.
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.userId))
      .unique();
    if (!user) return;

    const existing = await ctx.db
      .query("userStats")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    const row = { userId: args.userId, counts, capped, computedAt: Date.now() };
    if (existing) await ctx.db.patch(existing._id, row);
    else await ctx.db.insert("userStats", row);
  },
});

export const recomputeAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    for (const user of users) {
      await ctx.scheduler.runAfter(0, internal.adminStats.recomputeForUser, {
        userId: user.clerkId,
      });
    }
    return users.length;
  },
});

/**
 * Botón «recalcular ahora» del panel.
 *
 * Es una action nueva y vive en este módulo normal, no en `convex/actions/`:
 * esa carpeta está deprecada en Convex (fuerza runtime de Node) y esta action
 * no lo necesita.
 */
export const recomputeNow = action({
  args: {},
  handler: async (ctx): Promise<{ users: number }> => {
    await assertAdminFromAction(ctx);
    const users: number = await ctx.runMutation(internal.adminStats.recomputeAll, {});
    return { users };
  },
});

/**
 * Contadores de UN usuario, para la tarjeta de uso de la ficha admin.
 *
 * No se resuelve leyendo `listForAdmin` y filtrando: esa query trae la fila de
 * TODOS los usuarios para pintar solo uno, que es exactamente el defecto que
 * la tarea 15 corrige en el resto de la ficha. Esta lee `userStats` por
 * `by_user` con el `clerkId` puntual, sin tocar las filas de nadie más.
 *
 * `null` cuando el usuario todavía no tiene fila en `userStats` (nunca corrió
 * el recálculo desde que existe) — la tarjeta lo distingue de "cero" en vez
 * de mostrar un conteo que nunca se calculó.
 */
export const getForUser = query({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }) => {
    await assertAdmin(ctx);
    const stats = await ctx.db
      .query("userStats")
      .withIndex("by_user", (q) => q.eq("userId", clerkId))
      .unique();
    if (!stats) return null;
    return {
      counts: stats.counts,
      capped: stats.capped,
      computedAt: stats.computedAt,
    };
  },
});

/**
 * Totales del panel: suma de los contadores más su antigüedad.
 *
 * `users` es cuántas FILAS de `userStats` se sumaron, no cuántos usuarios hay.
 * Se devuelve para que la tarjeta pueda decir «contando M de K usuarios»
 * cuando difieran: sin eso, el panel afirmaba «N movimientos en toda la app»
 * callando que solo contó a una parte. La K sale de `users.listForAdmin` en el
 * cliente, a propósito: leer la tabla `users` aquí suscribiría esta tarjeta a
 * cada `patch` de `lastSeenAt` de cualquiera (el mismo defecto que se quitó de
 * `admin.getOverview`), y esa query ya está suscrita por otras tarjetas del
 * panel, así que Convex la deduplica y no cuesta una lectura extra.
 */
export const getTotals = query({
  args: {},
  handler: async (ctx) => {
    await assertAdmin(ctx);
    const rows = await ctx.db.query("userStats").collect();

    const totals: Record<string, number> = {};
    let capped = false;
    let computedAt: number | undefined;

    for (const row of rows) {
      for (const [table, n] of Object.entries(row.counts)) {
        totals[table] = (totals[table] ?? 0) + n;
      }
      if (row.capped) capped = true;
      // El más antiguo: el conjunto vale lo que vale su dato más viejo.
      if (computedAt === undefined || row.computedAt < computedAt) {
        computedAt = row.computedAt;
      }
    }

    return { totals, capped, computedAt, users: rows.length };
  },
});
