import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Los nueve trabajos dejan constancia de cada ejecución en la tabla `cronRuns`,
 * para que el panel de administración pueda avisar si uno dejó de correr.
 *
 * Siete lo consiguen apuntando al despachador `internal.cronRuns.run` con su
 * identificador. Los otros dos —los dos `crons.monthly`— siguen apuntando a su
 * mutation directamente y escriben su propio latido, porque Convex solo
 * garantiza «exactamente una vez» a las mutations programadas: una action se
 * ejecuta como mucho una vez y no se reintenta. El razonamiento completo está
 * en `lib/cronJobs.ts`.
 *
 * Los horarios son exactamente los mismos de siempre, y el test de
 * `lib/__tests__/cronJobs.test.ts` los comprueba contra una tabla fija leyendo
 * las registraciones reales de este archivo.
 */
const crons = cronJobs();

// Actualiza tasas de cambio diariamente a las 6 AM hora Colombia (UTC-5 = 11 AM UTC)
crons.daily(
  "actualizar tasas de cambio",
  { hourUTC: 11, minuteUTC: 0 },
  internal.cronRuns.run,
  { job: "fetchExchangeRates" }
);

// Revisa transacciones recurrentes diariamente a las 7 AM Colombia (12 UTC)
crons.daily(
  "generar transacciones recurrentes",
  { hourUTC: 12, minuteUTC: 0 },
  internal.cronRuns.run,
  { job: "processRecurringTransactions" }
);

// Revisa cuotas próximas, deudas vencidas y presupuestos: diario a las 8 AM Colombia (13 UTC)
crons.daily(
  "enviar alertas y notificaciones",
  { hourUTC: 13, minuteUTC: 0 },
  internal.cronRuns.run,
  { job: "sendAlerts" }
);

// Snapshot de patrimonio neto: día 1 a las 4:30 AM Colombia (9:30 UTC) — ANTES del rollover
// Destino directo A PROPÓSITO: es una mutation, y Convex solo garantiza
// «exactamente una vez» a las mutations programadas. Registra su propio latido.
crons.monthly(
  "snapshot patrimonio neto mensual",
  { day: 1, hourUTC: 9, minuteUTC: 30 },
  internal.netWorthSnapshots.captureForAllUsers
);

// Copia presupuestos recurrentes al nuevo mes: día 1 a las 5 AM Colombia (10 UTC)
// Destino directo por el mismo motivo que el anterior.
crons.monthly(
  "rollover presupuestos recurrentes",
  { day: 1, hourUTC: 10, minuteUTC: 0 },
  internal.budgets.rolloverRecurring
);

// Recordatorio de registro diario a las 7 PM Colombia (00:00 UTC)
crons.cron(
  "recordatorio de registro diario",
  "0 0 * * *",
  internal.cronRuns.run,
  { job: "sendDailyReminder" }
);

// Resumen semanal los lunes a las 9 AM Colombia (14:00 UTC)
crons.cron(
  "resumen semanal",
  "0 14 * * 1",
  internal.cronRuns.run,
  { job: "sendWeeklySummary" }
);

// Resumen mensual el día 1 a las 8 AM Colombia (13:00 UTC)
crons.cron(
  "resumen mensual",
  "0 13 1 * *",
  internal.cronRuns.run,
  { job: "sendMonthlySummary" }
);

// Recalcula los contadores del panel de administración: diario a las 3 UTC,
// fuera de la ventana en la que corren los demás trabajos.
crons.daily(
  "recalcular contadores del panel",
  { hourUTC: 3, minuteUTC: 0 },
  internal.cronRuns.run,
  { job: "recomputeUserStats" }
);

export default crons;
