import type { MutationCtx } from "../_generated/server";
import type { CronJobId } from "./cronJobs";

/**
 * Escritura del latido de un trabajo programado.
 *
 * Vive acá, y no dentro de `convex/cronRuns.ts`, porque tiene tres llamadores:
 * la mutation `record` del despachador y las dos mutations que se registran a
 * sí mismas (`netWorthSnapshots.captureForAllUsers` y
 * `budgets.rolloverRecurring`). Si cada una insertara por su cuenta, la poda
 * del historial acabaría divergiendo entre ellas.
 */

/** Ejecuciones que se conservan por job. Sin poda la tabla crece sin techo. */
const KEEP_PER_JOB = 20;

/**
 * Tope del mensaje de error guardado.
 *
 * Un error con un volcado enorme dentro haría que el documento superara el
 * límite de tamaño de Convex: el insert lanzaría, y se perderían la fila *y* el
 * error original, porque esa excepción taparía a la del job. Truncar convierte
 * el peor caso (no queda rastro de nada) en uno tolerable (queda el principio
 * del mensaje, que es donde está la causa).
 */
const TOPE_ERROR = 1000;

export function truncarError(mensaje: string): string {
  return mensaje.length <= TOPE_ERROR ? mensaje : `${mensaje.slice(0, TOPE_ERROR)}…[truncado]`;
}

/**
 * Inserta el latido y poda el historial del job.
 *
 * AVISO sobre `durationMs` para quien pinte el panel: cuando el llamador es una
 * mutation que se registra a sí misma (`captureNetWorth`, `rolloverBudgets`),
 * la duración sale SIEMPRE 0. No es un error: las mutations de Convex son
 * deterministas, así que `Date.now()` congela el mismo valor durante toda la
 * transacción y `startedAt` y `finishedAt` acaban siendo idénticos. Medir de
 * verdad ahí dentro es imposible. La duración solo significa algo en los siete
 * jobs que pasan por el despachador, que es una action y sí ve pasar el tiempo.
 * El panel debe omitir la duración de esos dos, no mostrar «0 ms».
 */
export async function registrarEjecucion(
  ctx: MutationCtx,
  args: {
    job: CronJobId;
    startedAt: number;
    finishedAt: number;
    ok: boolean;
    error?: string;
  },
): Promise<void> {
  const { job, startedAt, finishedAt, ok, error } = args;

  await ctx.db.insert("cronRuns", {
    job,
    startedAt,
    finishedAt,
    ok,
    error: error === undefined ? undefined : truncarError(error),
    durationMs: finishedAt - startedAt,
  });

  const previas = await ctx.db
    .query("cronRuns")
    .withIndex("by_job", (q) => q.eq("job", job))
    .order("desc")
    .collect();
  for (const vieja of previas.slice(KEEP_PER_JOB)) {
    await ctx.db.delete(vieja._id);
  }
}
