import type { Id } from "../../../convex/_generated/dataModel";
import { DEFAULT_ALERT_THRESHOLD } from "@/lib/constants";

/** Presupuesto tal como lo devuelve `budgets.listByMonthWithCategory`. */
export interface Budget {
  _id: Id<"budgets">;
  categoryId: Id<"categories">;
  categoryName?: string;
  categoryColor?: string;
  categoryIcon?: string;
  amount: number;
  spent: number;
  currency: string;
  month: string;
  alertThreshold?: number;
  notes?: string;
  recurring?: boolean;
}

/** Excedido, en riesgo (pasó el umbral) o al día. Ordena los grupos de la lista. */
export type BudgetState = "over" | "warn" | "ok";

export const STATE_TONE: Record<BudgetState, string> = {
  over: "var(--os-magenta)",
  warn: "var(--os-orange)",
  ok: "var(--os-lime)",
};

/** Color accesible para texto sobre el fondo de la tarjeta. */
export const STATE_TEXT: Record<BudgetState, string> = {
  over: "var(--os-magenta)",
  warn: "var(--os-orange-text)",
  ok: "var(--os-lime-text)",
};

export function thresholdOf(b: Pick<Budget, "alertThreshold">): number {
  return b.alertThreshold ?? DEFAULT_ALERT_THRESHOLD;
}

/** Fracción gastada sin topar en 1: el anillo la recorta, los textos necesitan el real. */
export function ratioOf(b: Pick<Budget, "amount" | "spent">): number {
  return b.amount > 0 ? b.spent / b.amount : 0;
}

export function stateOf(b: Pick<Budget, "amount" | "spent" | "alertThreshold">): BudgetState {
  const ratio = ratioOf(b);
  if (ratio > 1) return "over";
  if (ratio >= thresholdOf(b) / 100) return "warn";
  return "ok";
}

/** Color del anillo: el de la categoría mientras va bien, el del estado si se pasó. */
export function toneOf(b: Budget): string {
  const state = stateOf(b);
  return state === "ok" ? (b.categoryColor ?? "var(--os-lime)") : STATE_TONE[state];
}

// ─── Ritmo de gasto ───────────────────────────────────────────────────────────

export interface Pace {
  /** Fracción del mes transcurrida (1 si el mes ya terminó). */
  elapsed: number;
  /** Día en curso y días totales del mes. */
  day: number;
  days: number;
  /** Gasto proyectado a fin de mes al ritmo actual, en centavos. */
  projected: number;
  /** Cuánto se podría gastar por día con lo que queda, en centavos. 0 si ya no queda. */
  perDayLeft: number;
  /** true si la proyección no supera el presupuesto. */
  onTrack: boolean;
  /** Un mes cerrado ya no proyecta nada: el gasto es el definitivo. */
  closed: boolean;
}

/**
 * Cuánto del mes ha pasado frente a cuánto se ha gastado. Es el dato que falta a
 * mitad de mes: un 60% gastado el día 10 y el día 28 no significan lo mismo.
 * Un mes pasado o futuro se marca como cerrado y no proyecta.
 */
export function paceOf(month: string, spent: number, amount: number, nowMs: number): Pace {
  const [year, mo] = month.split("-").map(Number);
  const days = new Date(year, mo, 0).getDate();
  const now = new Date(nowMs);
  const isCurrent = now.getFullYear() === year && now.getMonth() + 1 === mo;
  const isPast = year < now.getFullYear() || (year === now.getFullYear() && mo < now.getMonth() + 1);

  const day = isCurrent ? now.getDate() : isPast ? days : 0;
  const elapsed = isCurrent ? day / days : isPast ? 1 : 0;
  const daysLeft = days - day;
  const remaining = Math.max(0, amount - spent);

  const projected = elapsed > 0 ? Math.round(spent / elapsed) : spent;
  return {
    elapsed,
    day,
    days,
    projected,
    perDayLeft: daysLeft > 0 ? Math.floor(remaining / daysLeft) : 0,
    onTrack: amount <= 0 || projected <= amount,
    closed: !isCurrent,
  };
}

/** Ordena de mayor a menor uso: lo que urge queda arriba. */
export function byUsage(a: Budget, b: Budget): number {
  return ratioOf(b) - ratioOf(a);
}
