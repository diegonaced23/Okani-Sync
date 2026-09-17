import type { MutationCtx } from "../_generated/server";

/**
 * Límite simple de operaciones por usuario en una ventana deslizante, sobre la
 * tabla "transactions" (índice "by_user"). Lanza si el usuario ya alcanzó `max`
 * operaciones en los últimos `windowMs` ms.
 */
export async function assertRateLimit(
  ctx: MutationCtx,
  clerkId: string,
  opts: { max: number; windowMs: number; message: string }
) {
  const latest = await ctx.db
    .query("transactions")
    .withIndex("by_user", (q) => q.eq("userId", clerkId))
    .order("desc")
    .take(opts.max + 1);
  const cutoff = Date.now() - opts.windowMs;
  if (latest.filter((t) => t.createdAt >= cutoff).length >= opts.max) {
    throw new Error(opts.message);
  }
}

/**
 * Igual que `assertRateLimit` pero contando filas de `auditLogs` por su índice
 * `by_user`.
 *
 * Hace falta una función aparte porque `assertRateLimit` cuenta filas de
 * `transactions`: aplicarlo a una operación que no crea transacciones limitaría
 * en función de cuántos movimientos registró el usuario, que no tiene relación
 * con la operación que se quiere proteger.
 */
export async function assertAuditRateLimit(
  ctx: MutationCtx,
  clerkId: string,
  opts: { max: number; windowMs: number; message: string }
) {
  const latest = await ctx.db
    .query("auditLogs")
    .withIndex("by_user", (q) => q.eq("userId", clerkId))
    .order("desc")
    .take(opts.max + 1);
  const cutoff = Date.now() - opts.windowMs;
  if (latest.filter((row) => row.createdAt >= cutoff).length >= opts.max) {
    throw new Error(opts.message);
  }
}
