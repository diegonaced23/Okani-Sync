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
