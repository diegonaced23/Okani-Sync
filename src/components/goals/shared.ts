import type { Doc } from "../../../convex/_generated/dataModel";

/** Meta tal como la devuelve `goals.list`: con el saldo de la cuenta vinculada resuelto. */
export type Goal = Doc<"goals"> & {
  linkedAccount?: { name: string; balance: number; currency: string; color: string };
};

export const GOAL_ICONS = [
  "🎯", "💻", "✈️", "🏠", "🚗", "📚",
  "🏖️", "💰", "🆘", "💍", "👶", "🏋️",
  "🎓", "🎸", "💊", "🌍", "🏦", "🎁",
];

/**
 * Cifras efectivas de la meta. Una meta vinculada a una cuenta no lleva progreso
 * propio: el avance es el saldo de esa cuenta, así que el monto y la moneda que
 * se muestran son los de la cuenta, no los del documento.
 */
export function viewOf(goal: Goal) {
  const linked = !!goal.linkedAccountId;
  const account = goal.linkedAccount;
  const saved = linked && account ? account.balance : goal.currentAmount;
  const currency = linked && account ? account.currency : goal.currency;
  const progress = goal.targetAmount > 0 ? saved / goal.targetAmount : 0;
  const remaining = Math.max(0, goal.targetAmount - saved);
  const completed = goal.status === "completada" || saved >= goal.targetAmount;
  return { linked, account, saved, currency, progress, remaining, completed };
}

export interface DeadlineInfo {
  text: string;
  overdue: boolean;
  urgent: boolean;
}

/** Medianoche local: los días se cuentan por fecha, no por horas de diferencia. */
function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Etiqueta de la fecha límite con el mismo criterio de urgencia que las deudas.
 *
 * La cuenta va de medianoche a medianoche. Con la diferencia en crudo, las fechas
 * —que se guardan al mediodía local— daban dos respuestas distintas el mismo día:
 * una meta que vencía hoy decía «queda 1 día» por la mañana y «vence hoy» por la
 * tarde, y una vencida ayer seguía diciendo «vence hoy» hasta el mediodía.
 */
export function deadlineLabel(deadlineMs: number, nowMs: number): DeadlineInfo {
  const days = Math.round((startOfDay(deadlineMs) - startOfDay(nowMs)) / 86_400_000);
  if (days < 0) return { text: "Fecha vencida", overdue: true, urgent: true };
  if (days === 0) return { text: "Vence hoy", overdue: false, urgent: true };
  if (days === 1) return { text: "Queda 1 día", overdue: false, urgent: true };
  if (days <= 7) return { text: `Quedan ${days} días`, overdue: false, urgent: true };
  if (days <= 60) return { text: `Quedan ${days} días`, overdue: false, urgent: false };
  const formatted = new Date(deadlineMs).toLocaleDateString("es-CO", {
    day: "numeric", month: "short", year: "numeric",
  });
  return { text: `Hasta ${formatted}`, overdue: false, urgent: false };
}

/** Cuánto habría que ahorrar al mes para llegar a tiempo. null si ya no hay plazo. */
export function monthlyNeeded(remaining: number, deadlineMs: number, nowMs: number): number | null {
  const months = (deadlineMs - nowMs) / (30.44 * 86_400_000);
  if (months <= 0 || remaining <= 0) return null;
  return Math.ceil(remaining / months);
}

/** Primero lo que está más cerca de cumplirse: motiva más que el orden de creación. */
export function byProgress(a: Goal, b: Goal): number {
  return viewOf(b).progress - viewOf(a).progress;
}
