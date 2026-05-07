import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Actualiza tasas de cambio diariamente a las 6 AM hora Colombia (UTC-5 = 11 AM UTC)
crons.daily(
  "actualizar tasas de cambio",
  { hourUTC: 11, minuteUTC: 0 },
  internal.actions.fetchExchangeRates.run
);

// Revisa transacciones recurrentes diariamente a las 7 AM Colombia (12 UTC)
crons.daily(
  "generar transacciones recurrentes",
  { hourUTC: 12, minuteUTC: 0 },
  internal.actions.processRecurringTransactions.run
);

// Revisa cuotas próximas, deudas vencidas y presupuestos: diario a las 8 AM Colombia (13 UTC)
crons.daily(
  "enviar alertas y notificaciones",
  { hourUTC: 13, minuteUTC: 0 },
  internal.actions.sendAlerts.run
);

// Copia presupuestos recurrentes al nuevo mes: día 1 a las 5 AM Colombia (10 UTC)
crons.monthly(
  "rollover presupuestos recurrentes",
  { day: 1, hourUTC: 10, minuteUTC: 0 },
  internal.budgets.rolloverRecurring
);

// Recordatorio de registro diario a las 7 PM Colombia (00:00 UTC)
crons.cron(
  "recordatorio de registro diario",
  "0 0 * * *",
  internal.actions.sendDailyReminder.run,
  {}
);

// Resumen semanal los lunes a las 9 AM Colombia (14:00 UTC)
crons.cron(
  "resumen semanal",
  "0 14 * * 1",
  internal.actions.sendWeeklySummary.run,
  {}
);

// Resumen mensual el día 1 a las 8 AM Colombia (13:00 UTC)
crons.cron(
  "resumen mensual",
  "0 13 1 * *",
  internal.actions.sendMonthlySummary.run,
  {}
);

export default crons;
