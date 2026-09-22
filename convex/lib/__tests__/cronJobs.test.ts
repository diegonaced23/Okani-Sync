import { describe, it, expect } from "vitest";
import crons from "../../crons";
import { CRON_JOBS, JOBS_CON_LATIDO_PROPIO, type CronJobId } from "../cronJobs";

/**
 * crons.ts es quien programa de verdad. Si alguien añade un job allí y no en
 * CRON_JOBS, el panel lo daría por inexistente y nadie vería que falla; si lo
 * quita de allí y lo deja en CRON_JOBS, el panel lo daría por caído para
 * siempre.
 *
 * Estas pruebas leen las REGISTRACIONES REALES: `cronJobs()` devuelve un objeto
 * con una propiedad pública `crons` donde cada entrada es
 * `{ name, args, schedule }`, que es exactamente lo que Convex despliega.
 * Antes esto se hacía con una expresión regular sobre el texto del archivo, y
 * era papel mojado: casaba texto, no programación. Comentar el bloque entero de
 * un cron lo dejaba en verde con el cron desprogramado, y un `job: "x"` suelto
 * dentro de un comentario inventaba un job fantasma.
 */
type Registracion = { name: string; args: unknown[]; schedule: Record<string, unknown> };

const REGISTRACIONES = Object.entries(
  (crons as unknown as { crons: Record<string, Registracion> }).crons,
).map(([nombre, r]) => ({ nombre, ...r }));

/** Nombre de la función destino para los jobs que no pasan por el despachador. */
const DESTINOS_DIRECTOS: Record<string, CronJobId> = {
  "netWorthSnapshots:captureForAllUsers": "captureNetWorth",
  "budgets:rolloverRecurring": "rolloverBudgets",
};

const DESPACHADOR = "cronRuns:run";

/** Identificador del job al que corresponde una registración. */
function jobDe(r: Registracion): string {
  if (r.name === DESPACHADOR) {
    return String((r.args[0] as { job?: unknown })?.job);
  }
  return DESTINOS_DIRECTOS[r.name] ?? `desconocido(${r.name})`;
}

/**
 * Horarios esperados, copia fija a mano.
 *
 * Es deliberadamente una duplicación de crons.ts: sirve de testigo. Mover un
 * cron de hora es un cambio que se hace queriendo una vez cada mucho, y que si
 * se cuela sin querer no lo nota nadie hasta que un usuario echa de menos un
 * mes de patrimonio. Tocar este archivo obliga a que el cambio sea consciente.
 */
const HORARIOS_ESPERADOS: Record<CronJobId, Record<string, unknown>> = {
  fetchExchangeRates:           { type: "daily",   hourUTC: 11, minuteUTC: 0 },
  processRecurringTransactions: { type: "daily",   hourUTC: 12, minuteUTC: 0 },
  sendAlerts:                   { type: "daily",   hourUTC: 13, minuteUTC: 0 },
  captureNetWorth:              { type: "monthly", day: 1, hourUTC: 9,  minuteUTC: 30 },
  rolloverBudgets:              { type: "monthly", day: 1, hourUTC: 10, minuteUTC: 0 },
  sendDailyReminder:            { type: "cron",    cron: "0 0 * * *" },
  sendWeeklySummary:            { type: "cron",    cron: "0 14 * * 1" },
  sendMonthlySummary:           { type: "cron",    cron: "0 13 1 * *" },
  recomputeUserStats:           { type: "daily",   hourUTC: 3,  minuteUTC: 0 },
  billCardInstallments:         { type: "daily",   hourUTC: 5,  minuteUTC: 30 },
};

describe("CRON_JOBS", () => {
  it("no repite identificadores", () => {
    expect(new Set(CRON_JOBS.map((j) => j.id)).size).toBe(CRON_JOBS.length);
  });

  it("declara una periodicidad positiva para cada job", () => {
    for (const job of CRON_JOBS) {
      expect(job.everyMs, job.id).toBeGreaterThan(0);
    }
  });
});

describe("crons.ts", () => {
  it("programa exactamente un cron por cada job declarado", () => {
    expect(REGISTRACIONES).toHaveLength(CRON_JOBS.length);
  });

  it("los jobs programados coinciden exactamente con CRON_JOBS", () => {
    expect(REGISTRACIONES.map(jobDe).sort()).toEqual(CRON_JOBS.map((j) => j.id).sort());
  });

  it("no mueve ningún horario", () => {
    for (const r of REGISTRACIONES) {
      expect(r.schedule, `${jobDe(r)} (${r.nombre})`).toEqual(
        HORARIOS_ESPERADOS[jobDe(r) as CronJobId],
      );
    }
  });

  /**
   * El guardián importante. Una mutation programada se ejecuta exactamente una
   * vez y Convex la reintenta; una action, como mucho una vez y sin reintento.
   * Meter estos dos jobs por el despachador —que es una action— los degradaría
   * en silencio, y en captureNetWorth eso significa un hueco permanente en el
   * histórico de patrimonio, que no se puede recalcular hacia atrás.
   */
  it("no canaliza por el despachador los jobs que deben seguir siendo mutations", () => {
    for (const id of JOBS_CON_LATIDO_PROPIO) {
      const r = REGISTRACIONES.find((x) => jobDe(x) === id);
      expect(r, `${id} debe seguir programado`).toBeDefined();
      expect(r!.name, `${id} perdería la garantía de exactamente-una-vez`).not.toBe(DESPACHADOR);
    }
  });

  it("canaliza por el despachador todos los demás jobs", () => {
    const propios = new Set<string>(JOBS_CON_LATIDO_PROPIO);
    for (const r of REGISTRACIONES) {
      if (propios.has(jobDe(r))) continue;
      expect(r.name, `${jobDe(r)} debería pasar por el despachador`).toBe(DESPACHADOR);
    }
  });
});
