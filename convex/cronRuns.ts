/**
 * Despachador de los trabajos programados: ejecuta el job y deja constancia.
 *
 * Ocho de los diez crons apuntan aquí en lugar de a su función directamente.
 * Se hace así, y no envolviendo cada una de las ocho funciones, para que la
 * lógica del latido —registrar, capturar el error, podar el historial— exista
 * en un solo sitio. Ocho copias divergen.
 *
 * Los otros dos (`captureNetWorth` y `rolloverBudgets`) siguen siendo destino
 * directo del cron y registran su propio latido: son mutations, y pasarlas por
 * esta action las degradaría de «exactamente una vez» a «como mucho una vez».
 * El porqué está explicado en `lib/cronJobs.ts`.
 */

import { internalAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { CRON_JOBS, JOBS_CON_LATIDO_PROPIO, type JobDespachado } from "./lib/cronJobs";
import { registrarEjecucion, truncarError } from "./lib/cronHeartbeat";

/**
 * Identificadores que este módulo acepta: solo los ocho que despacha.
 *
 * Se listan explícitos en vez de derivarse de `CRON_JOBS` para que sean
 * literales que Convex pueda validar, pero no pueden desincronizarse en
 * silencio: `dispatch` recibe `JobDespachado` y termina en un `never`, así que
 * si sobra uno falla la llamada a `dispatch` y si falta uno falla el `switch`.
 * Apuntar un cron de los dos con latido propio hacia acá es error de compilación.
 */
const jobDespachadoValidator = v.union(
  v.literal("fetchExchangeRates"),
  v.literal("processRecurringTransactions"),
  v.literal("sendAlerts"),
  v.literal("sendDailyReminder"),
  v.literal("sendWeeklySummary"),
  v.literal("sendMonthlySummary"),
  v.literal("recomputeUserStats"),
  v.literal("billCardInstallments"),
);

export const record = internalMutation({
  args: {
    job: jobDespachadoValidator,
    startedAt: v.number(),
    finishedAt: v.number(),
    ok: v.boolean(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await registrarEjecucion(ctx, args);
  },
});

/**
 * Última ejecución de cada job, para el panel.
 *
 * `finishedAt` NO es opcional acá, igual que en el esquema: una fila solo se
 * escribe cuando la ejecución terminó. Un job que se colgó no aparece en este
 * mapa —no tiene entrada— y eso es lo que el panel interpreta como caducidad.
 * Tipar el campo como opcional obligaría a la UI a defenderse de un `undefined`
 * que no puede ocurrir.
 */
export const latestByJob = internalQuery({
  args: {},
  handler: async (ctx) => {
    const out: Record<string, { finishedAt: number; ok: boolean; error?: string }> = {};
    for (const job of CRON_JOBS) {
      const last = await ctx.db
        .query("cronRuns")
        .withIndex("by_job", (q) => q.eq("job", job.id))
        .order("desc")
        .first();
      if (last) out[job.id] = { finishedAt: last.finishedAt, ok: last.ok, error: last.error };
    }
    return out;
  },
});

export const run = internalAction({
  args: { job: jobDespachadoValidator },
  handler: async (ctx, { job }) => {
    const startedAt = Date.now();
    let ok = true;
    let error: string | undefined;

    try {
      await dispatch(ctx, job);
    } catch (err) {
      ok = false;
      // Se trunca ACÁ, antes de que el mensaje viaje como argumento de la
      // mutation: un mensaje descomunal reventaría el límite de tamaño en el
      // propio envío y nos quedaríamos sin fila y sin error.
      error = truncarError(err instanceof Error ? err.message : String(err));
      // Se registra y SE VUELVE A LANZAR: el latido no debe tragarse el fallo,
      // solo dejar constancia de él.
    }

    await ctx.runMutation(internal.cronRuns.record, {
      job, startedAt, finishedAt: Date.now(), ok, error,
    });

    if (!ok) throw new Error(`Cron '${job}' falló: ${error}`);
  },
});

/**
 * Mapa job → función real. El `never` final impide olvidar uno.
 *
 * Cada rama hace `await` y devuelve vacío en lugar de `return ctx.run...`
 * porque alguna destino podría devolver datos: al despachador no le sirven y
 * propagarlos ataría la firma de este helper a lo que cada job decida devolver
 * mañana.
 */
async function dispatch(ctx: ActionCtx, job: JobDespachado): Promise<void> {
  switch (job) {
    case "fetchExchangeRates":
      await ctx.runAction(internal.actions.fetchExchangeRates.run, {});
      return;
    case "processRecurringTransactions":
      await ctx.runAction(internal.actions.processRecurringTransactions.run, {});
      return;
    case "sendAlerts":
      await ctx.runAction(internal.actions.sendAlerts.run, {});
      return;
    case "sendDailyReminder":
      await ctx.runAction(internal.actions.sendDailyReminder.run, {});
      return;
    case "sendWeeklySummary":
      await ctx.runAction(internal.actions.sendWeeklySummary.run, {});
      return;
    case "sendMonthlySummary":
      await ctx.runAction(internal.actions.sendMonthlySummary.run, {});
      return;
    case "recomputeUserStats":
      // Va por el despachador a propósito, a diferencia de los dos jobs de
      // latido propio: el recálculo es idempotente y diario, así que perder
      // una ejecución (la garantía "como mucho una vez" de una action) se cura
      // sola al día siguiente. No hay dato irrecuperable en juego.
      await ctx.runMutation(internal.adminStats.recomputeAll, {});
      return;
    case "billCardInstallments":
      // Idempotente: una cuota facturada no vuelve a salir. Un día perdido se
      // factura al siguiente, así que «como mucho una vez» no pierde datos.
      await ctx.runMutation(internal.cardBilling.billDue, {});
      return;
    default: {
      const sinManejar: never = job;
      throw new Error(
        `Job sin despachar: ${String(sinManejar)}. ` +
        `Los de latido propio (${JOBS_CON_LATIDO_PROPIO.join(", ")}) no pasan por acá a propósito.`,
      );
    }
  }
}
