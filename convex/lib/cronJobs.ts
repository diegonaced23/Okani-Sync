/**
 * Registro único de los trabajos programados.
 *
 * `convex/crons.ts` los programa, el despachador de `convex/cronRuns.ts` los
 * ejecuta y el panel de administración muestra su salud. Los tres leen de aquí
 * para que no puedan discrepar sobre cuántos jobs hay ni cómo se llaman.
 *
 * `everyMs` es la periodicidad ESPERADA, y sirve para decidir si un job va
 * atrasado. No programa nada: la programación real vive en crons.ts.
 */
export const CRON_JOBS = [
  { id: "fetchExchangeRates", label: "Tasas de cambio", everyMs: 24 * 60 * 60 * 1000 },
  { id: "processRecurringTransactions", label: "Movimientos recurrentes", everyMs: 24 * 60 * 60 * 1000 },
  { id: "sendAlerts", label: "Alertas y notificaciones", everyMs: 24 * 60 * 60 * 1000 },
  { id: "sendDailyReminder", label: "Recordatorio diario", everyMs: 24 * 60 * 60 * 1000 },
  { id: "sendWeeklySummary", label: "Resumen semanal", everyMs: 7 * 24 * 60 * 60 * 1000 },
  { id: "captureNetWorth", label: "Snapshot de patrimonio", everyMs: 31 * 24 * 60 * 60 * 1000 },
  { id: "rolloverBudgets", label: "Rollover de presupuestos", everyMs: 31 * 24 * 60 * 60 * 1000 },
  { id: "sendMonthlySummary", label: "Resumen mensual", everyMs: 31 * 24 * 60 * 60 * 1000 },
  // Va por el despachador (no es de latido propio): el recálculo es idempotente
  // y diario, así que perder una ejecución se cura sola al día siguiente. No
  // hay dato irrecuperable en juego, a diferencia de captureNetWorth.
  { id: "recomputeUserStats", label: "Contadores del panel", everyMs: 24 * 60 * 60 * 1000 },
  // Por el despachador por el mismo motivo: es idempotente (una cuota facturada no
  // vuelve a salir), así que un día perdido se factura al siguiente.
  { id: "billCardInstallments", label: "Facturación de cuotas de tarjeta", everyMs: 24 * 60 * 60 * 1000 },
] as const;

export type CronJobId = (typeof CRON_JOBS)[number]["id"];

/**
 * Los dos jobs que NO pasan por el despachador y registran su latido ellos
 * mismos.
 *
 * El motivo es una garantía de Convex, no una preferencia de estilo: una
 * *mutation* programada se ejecuta exactamente una vez, y Convex la reintenta
 * ante errores transitorios; una *action* programada se ejecuta como mucho una
 * vez y no se reintenta. Como el despachador es una action, meter estas dos
 * mutations por dentro las degradaría a «como mucho una vez».
 *
 * En `captureNetWorth` eso costaría datos irrecuperables: los snapshots de
 * patrimonio no se pueden recalcular hacia atrás y son el único histórico, así
 * que un mes perdido es un hueco permanente.
 *
 * Que sigan siendo destino directo del cron no las deja sin vigilancia: cada
 * una inserta su propia fila de `cronRuns` dentro de su misma transacción, que
 * es más fuerte que pasar por el despachador —el latido es atómico con el
 * trabajo, así que no puede ocurrir uno sin el otro—.
 */
export const JOBS_CON_LATIDO_PROPIO = ["captureNetWorth", "rolloverBudgets"] as const;

export type JobConLatidoPropio = (typeof JOBS_CON_LATIDO_PROPIO)[number];

/** Los ocho jobs que sí ejecuta el despachador de `convex/cronRuns.ts`. */
export type JobDespachado = Exclude<CronJobId, JobConLatidoPropio>;
