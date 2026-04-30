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

export default crons;
