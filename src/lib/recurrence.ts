// Cálculo de fechas de los movimientos recurrentes. Lo comparten las mutations de
// convex/recurringTransactions.ts, el cron (convex/actions/processRecurringTransactions.ts)
// y la vista previa del formulario, para que las tres partes coincidan siempre.
//
// Todo se hace en UTC explícito (Date.UTC / getUTC*): Convex corre en UTC y los tests
// en la hora local del equipo; mezclar métodos locales y UTC pasaría en local y
// fallaría en producción.

export type Frequency = "diaria" | "semanal" | "quincenal" | "mensual" | "anual";

/** Frecuencias que se pueden elegir al crear. "diaria" solo existe en datos viejos. */
export const SELECTABLE_FREQUENCIES = ["semanal", "quincenal", "mensual", "anual"] as const;
export type SelectableFrequency = (typeof SELECTABLE_FREQUENCIES)[number];

/**
 * Hora (UTC) a la que se fija cada ocurrencia: 6 AM en Colombia, antes del cron
 * de las 12:00 UTC. Una hora fija anterior al cron evita que la ocurrencia quede
 * unos segundos por delante de la ejecución y se corra un día cada ciclo.
 */
export const RUN_HOUR_UTC = 11;

/** Timestamp en uso cuando el cron finaliza un recurrente por fecha de fin. */
export const ENDED_OCCURRENCE = Number.MAX_SAFE_INTEGER;

export function daysInMonthUTC(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Día `day` del mes (recortado al último día si no existe), a la hora fija. */
function atDay(year: number, month: number, day: number): number {
  // Date.UTC normaliza meses fuera de rango (12 → enero del año siguiente)
  const norm = new Date(Date.UTC(year, month, 1));
  const y = norm.getUTCFullYear();
  const m = norm.getUTCMonth();
  return Date.UTC(y, m, Math.min(day, daysInMonthUTC(y, m)), RUN_HOUR_UTC);
}

/** "YYYY-MM-DD" → timestamp de ese día calendario a la hora fija. */
export function dateKeyToTs(key: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) throw new Error("Fecha inválida");
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  if (mo < 0 || mo > 11 || d < 1 || d > daysInMonthUTC(y, mo)) throw new Error("Fecha inválida");
  return Date.UTC(y, mo, d, RUN_HOUR_UTC);
}

/** Timestamp → "YYYY-MM-DD" del día calendario UTC. */
export function tsToDateKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Una ocurrencia después de `from`. Mensual y anual usan `anchorDay` (el día
 * elegido) y no el día de `from`: así el 31 recortado a febrero vuelve al 31 en marzo.
 */
export function stepOccurrence(frequency: Frequency, from: number, anchorDay?: number): number {
  const d = new Date(from);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = anchorDay ?? d.getUTCDate();
  switch (frequency) {
    case "diaria":
      return Date.UTC(y, m, d.getUTCDate() + 1, RUN_HOUR_UTC);
    case "semanal":
      return Date.UTC(y, m, d.getUTCDate() + 7, RUN_HOUR_UTC);
    case "quincenal":
      return Date.UTC(y, m, d.getUTCDate() + 15, RUN_HOUR_UTC);
    case "mensual":
      return atDay(y, m + 1, day);
    case "anual":
      return atDay(y + 1, m, day);
  }
}

/**
 * Primera ocurrencia estrictamente posterior a `now`, avanzando desde la anterior
 * (`from`). Avanzar desde la ocurrencia previa y no desde `now` mantiene el
 * calendario fijo; si hubo días sin cron, salta las fechas perdidas en vez de
 * generar movimientos atrasados.
 */
export function nextOccurrenceAfter(
  frequency: Frequency,
  from: number,
  now: number,
  anchorDay?: number,
): number {
  let next = stepOccurrence(frequency, from, anchorDay);
  for (let i = 0; next <= now && i < 5000; i++) {
    next = stepOccurrence(frequency, next, anchorDay);
  }
  return next;
}

/**
 * Primera fecha mensual con el día `dayOfMonth` estrictamente posterior a `todayKey`.
 * Hoy no cuenta: el cron del día pudo haber corrido ya.
 */
export function firstMonthlyDateKey(todayKey: string, dayOfMonth: number): string {
  const today = dateKeyToTs(todayKey);
  const d = new Date(today);
  const thisMonth = atDay(d.getUTCFullYear(), d.getUTCMonth(), dayOfMonth);
  return tsToDateKey(thisMonth > today ? thisMonth : atDay(d.getUTCFullYear(), d.getUTCMonth() + 1, dayOfMonth));
}

/** Las próximas `count` ocurrencias empezando por `first` (incluida). */
export function upcomingOccurrences(
  frequency: Frequency,
  first: number,
  count: number,
  anchorDay?: number,
): number[] {
  const out = [first];
  while (out.length < count) out.push(stepOccurrence(frequency, out[out.length - 1], anchorDay));
  return out;
}

/** Cuántas veces ocurre al mes en promedio, para estimar el compromiso mensual. */
export function monthlyFactor(frequency: Frequency): number {
  switch (frequency) {
    case "diaria": return 365 / 12;
    case "semanal": return 52 / 12;
    case "quincenal": return 365 / 15 / 12;
    case "mensual": return 1;
    case "anual": return 1 / 12;
  }
}
