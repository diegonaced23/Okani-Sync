import type { Doc } from "../../../convex/_generated/dataModel";
import { getNextCutoffTs, getNextPaymentTs, getPrevCutoffTs } from "@/lib/cardCycle";

// Utilidades de estilo iOS compartidas con los demás módulos (viven en src/lib/ios.ts)
export { EASE_OUT_EXPO, GLASS_SURFACE, OVERFLOW_ROW, SPRING, haptic, tint } from "@/lib/ios";

export type Card = Doc<"cards">;

/** Fracción del cupo usada. Sin cupo no hay porcentaje que calcular. */
export function usageOf(card: Pick<Card, "creditLimit" | "currentBalance">): number {
  return card.creditLimit > 0 ? card.currentBalance / card.creditLimit : 0;
}

/** Verde hasta el 60%, naranja hasta el 80%, rojo por encima: el criterio de siempre. */
export function usageTone(usage: number): string {
  if (usage >= 0.8) return "var(--os-magenta)";
  if (usage >= 0.6) return "var(--os-orange)";
  return "var(--os-lime)";
}

export function usageTextTone(usage: number): string {
  if (usage >= 0.8) return "var(--os-magenta)";
  if (usage >= 0.6) return "var(--os-orange-text)";
  return "var(--os-lime-text)";
}

export interface DueInfo {
  /** Timestamp del próximo pago */
  ts: number;
  days: number;
  text: string;
  urgent: boolean;
}

/**
 * Cuándo toca pagar esta tarjeta. El listado mostraba «Corte día 15 · Pago día 5»,
 * dos números que obligan a hacer la cuenta mental; esto la hace por ti.
 *
 * El pago que toca ahora se deriva del corte que YA cerró, no del siguiente: entre
 * el corte y el día de pago —unos diez días de cada mes, justo cuando importa— el
 * siguiente corte apunta al pago del mes que viene. Si el pago de ese ciclo ya pasó,
 * el próximo es el del corte siguiente. No se marca «vencido»: la app no sabe si el
 * extracto se pagó, así que afirmarlo sería inventar.
 */
export function dueOf(card: Pick<Card, "cutoffDay" | "paymentDay">, nowMs: number): DueInfo {
  const now = new Date(nowMs);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const fromClosedCycle = getNextPaymentTs(card.paymentDay, getPrevCutoffTs(card.cutoffDay, now));
  const ts =
    fromClosedCycle >= startOfToday.getTime()
      ? fromClosedCycle
      : getNextPaymentTs(card.paymentDay, getNextCutoffTs(card.cutoffDay, now));

  // Días naturales, no fracciones: del 1 al 5 son 4 días aunque el pago se guarde
  // a mediodía. `round` absorbe los saltos de hora de los cambios de horario.
  const startOfDue = new Date(ts);
  startOfDue.setHours(0, 0, 0, 0);
  const days = Math.max(
    0,
    Math.round((startOfDue.getTime() - startOfToday.getTime()) / 86_400_000)
  );
  if (days === 0) return { ts, days, text: "Paga hoy", urgent: true };
  if (days === 1) return { ts, days, text: "Paga mañana", urgent: true };
  if (days <= 5) return { ts, days, text: `Paga en ${days} días`, urgent: true };
  const formatted = new Date(ts).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
  return { ts, days, text: `Paga el ${formatted}`, urgent: false };
}

/** Filtra por nombre o banco. Cadena vacía = no filtra. */
export function matchesQuery(card: Card, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    card.name.toLowerCase().includes(q) ||
    card.bankName.toLowerCase().includes(q) ||
    card.lastFourDigits.includes(q)
  );
}

// ─── Compras y cuotas ─────────────────────────────────────────────────────────

export type Purchase = Doc<"cardPurchases">;

/**
 * Forma mínima de una cuota tal como la devuelve `getCardDetailData`. No es el
 * Doc completo: la query proyecta solo los campos que la UI necesita.
 */
export interface InstallmentLike {
  _id: string;
  installmentNumber: number;
  amount: number;
  dueDate: number;
  paid: boolean;
  paidAt?: number;
  principalAmount?: number;
  interestAmount?: number;
  remainingPrincipal?: number;
  /** Lo abonado (admite pagos parciales) */
  paidAmount?: number;
  /** Lo que la cuota debe hoy: sin intereses aún no cobrados ni lo abonado */
  remaining?: number;
}

/**
 * Fila de un extracto. Vivía dentro de `CardStatementDocument`, así que el
 * contenedor de pestañas dependía del módulo del PDF solo para tipar; ahora el
 * tipo es de ambos y el documento lo importa de aquí.
 */
export interface InstallmentEntry {
  installmentNumber: number;
  totalInstallments: number;
  amount: number;
  dueDate: number;
  interestAmount?: number;
  principalAmount?: number;
  description: string;
  category: string;
}

/** Cuántas cuotas van pagadas, como fracción. */
export function purchaseProgress(purchase: Pick<Purchase, "paidInstallments" | "totalInstallments">): number {
  return purchase.totalInstallments > 0
    ? purchase.paidInstallments / purchase.totalInstallments
    : 0;
}

/** Interés real de la cuota, o undefined si no lleva. Evita pintar un «0» suelto. */
export function interestOf(installment: Pick<InstallmentLike, "interestAmount">): number | undefined {
  return installment.interestAmount !== undefined && installment.interestAmount > 0
    ? installment.interestAmount
    : undefined;
}
