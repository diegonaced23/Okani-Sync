import type { Doc } from "../../../convex/_generated/dataModel";
import {
  ENDED_OCCURRENCE,
  dateKeyToTs,
  tsToDateKey,
  type Frequency,
  type SelectableFrequency,
} from "@/lib/recurrence";
import { todayStr } from "@/lib/money";

export type Recurring = Doc<"recurringTransactions">;
export type RecurringKind = "gasto" | "ingreso";

const DAY_MS = 86_400_000;

export const FREQUENCY_LABELS: Record<SelectableFrequency, string> = {
  semanal: "Semanal",
  // "Quincenal" en Colombia suele ser 15 y último día; aquí es cada 15 días exactos
  quincenal: "Cada 15 días",
  mensual: "Mensual",
  anual: "Anual",
};

// Las fechas programadas son días calendario (a las 11:00 UTC): se formatean en UTC
const weekdayFmt = new Intl.DateTimeFormat("es-CO", { weekday: "long", timeZone: "UTC" });
const shortFmt = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "UTC" });
const longFmt = new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export function formatShortDate(ts: number) {
  return shortFmt.format(ts).replace(".", "");
}

export function formatLongDate(ts: number) {
  const s = longFmt.format(ts).replace(/\./g, "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "Cada lunes", "Cada mes, día 5", "Cada año, 12 mar"… */
export function describeSchedule(frequency: Frequency, next: number, dayOfMonth?: number): string {
  switch (frequency) {
    case "diaria": return "Cada día";
    case "semanal": return `Cada ${weekdayFmt.format(next)}`;
    case "quincenal": return "Cada 15 días";
    case "mensual": return dayOfMonth ? `Cada mes, día ${dayOfMonth}` : "Cada mes";
    case "anual": return `Cada año, ${formatShortDate(next)}`;
  }
}

/** Días calendario entre hoy (hora local) y la fecha programada. Negativo = vencido. */
export function daysUntil(next: number): number {
  return Math.round((dateKeyToTs(tsToDateKey(next)) - dateKeyToTs(todayStr())) / DAY_MS);
}

export function isEnded(rec: Pick<Recurring, "nextOccurrence">) {
  return rec.nextOccurrence >= ENDED_OCCURRENCE;
}

/** "Hoy", "Mañana", "En 3 días", "12 oct" */
export function relativeLabel(next: number): string {
  const d = daysUntil(next);
  if (d < 0) return "Pendiente";
  if (d === 0) return "Hoy";
  if (d === 1) return "Mañana";
  if (d < 7) return `En ${d} días`;
  return formatShortDate(next);
}

export function kindOf(rec: Pick<Recurring, "type">): RecurringKind {
  return rec.type === "ingreso" ? "ingreso" : "gasto";
}

export interface RecurringSuggestion {
  description: string;
  kind: RecurringKind;
  icon: string;
  /** Nombres de categoría (en minúsculas) que se preseleccionan si existen */
  categoryHints: string[];
}

export const SUGGESTIONS: RecurringSuggestion[] = [
  { description: "Arriendo", kind: "gasto", icon: "home", categoryHints: ["vivienda", "arriendo", "apartamento", "hogar"] },
  { description: "Netflix", kind: "gasto", icon: "music", categoryHints: ["entretenimiento", "suscripciones"] },
  { description: "Spotify", kind: "gasto", icon: "music", categoryHints: ["entretenimiento", "suscripciones"] },
  { description: "Internet", kind: "gasto", icon: "zap", categoryHints: ["servicios"] },
  { description: "Celular", kind: "gasto", icon: "phone", categoryHints: ["celular", "servicios"] },
  { description: "Gimnasio", kind: "gasto", icon: "dumbbell", categoryHints: ["gimnasio", "salud", "deporte"] },
  { description: "Administración", kind: "gasto", icon: "building-2", categoryHints: ["vivienda", "apartamento", "hogar"] },
  { description: "Seguro", kind: "gasto", icon: "heart-pulse", categoryHints: ["salud", "seguros"] },
  { description: "Salario", kind: "ingreso", icon: "briefcase", categoryHints: ["salario", "sueldo", "nómina"] },
  { description: "Arriendo cobrado", kind: "ingreso", icon: "building-2", categoryHints: ["arriendos", "inversiones"] },
  { description: "Freelance", kind: "ingreso", icon: "laptop", categoryHints: ["freelance"] },
  { description: "Pensión", kind: "ingreso", icon: "piggy-bank", categoryHints: ["pensión", "otros ingresos"] },
];

export { sourceVisual } from "@/components/ui/source-chip";
