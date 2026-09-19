import { Car, Ellipsis, Home, Landmark, UserRound, type LucideIcon } from "lucide-react";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

export type Debt = Doc<"debts">;
export type Loan = Doc<"loans">;
export type DebtType = Debt["type"];
export type ObligationStatus = Debt["status"];

/** Lado de la pantalla: lo que debo (deudas) o lo que me deben (préstamos) */
export type Side = "debo" | "meDeben";

export const DEBT_TYPE_META: Record<DebtType, { label: string; icon: LucideIcon }> = {
  prestamo: { label: "Crédito bancario", icon: Landmark },
  personal: { label: "Personal", icon: UserRound },
  hipoteca: { label: "Hipoteca", icon: Home },
  vehiculo: { label: "Vehículo", icon: Car },
  otro: { label: "Otro", icon: Ellipsis },
};

export const DEBT_TYPE_ORDER: readonly DebtType[] = ["prestamo", "personal", "hipoteca", "vehiculo", "otro"];

/**
 * Deuda y préstamo con la misma forma, para compartir filas, resumen y la hoja
 * de abono. `counterpart` es el acreedor (deuda) o quien pidió prestado (préstamo).
 */
export interface Obligation {
  kind: "debt" | "loan";
  id: Id<"debts"> | Id<"loans">;
  name: string;
  counterpart: string;
  color: string;
  currency: string;
  originalAmount: number;
  currentBalance: number;
  status: ObligationStatus;
  dueDate?: number;
  monthlyPayment?: number;
  interestRate?: number;
  archived: boolean;
  debtType?: DebtType;
}

export function fromDebt(d: Debt): Obligation {
  return {
    kind: "debt",
    id: d._id,
    name: d.name,
    counterpart: d.creditor,
    color: d.color,
    currency: d.currency,
    originalAmount: d.originalAmount,
    currentBalance: d.currentBalance,
    status: d.status,
    dueDate: d.dueDate,
    monthlyPayment: d.monthlyPayment,
    interestRate: d.interestRate,
    archived: d.archived === true,
    debtType: d.type,
  };
}

export function fromLoan(l: Loan): Obligation {
  return {
    kind: "loan",
    id: l._id,
    name: l.name,
    counterpart: l.borrower,
    color: l.color,
    currency: l.currency,
    originalAmount: l.originalAmount,
    currentBalance: l.currentBalance,
    status: l.status,
    dueDate: l.dueDate,
    archived: l.archived,
  };
}

/** Fracción ya pagada (deuda) o cobrada (préstamo), 0–1 */
export function progressOf(o: Pick<Obligation, "originalAmount" | "currentBalance">): number {
  if (o.originalAmount <= 0) return 1;
  return Math.max(0, Math.min(1, (o.originalAmount - o.currentBalance) / o.originalAmount));
}

export function detailHref(o: Pick<Obligation, "kind" | "id">) {
  return o.kind === "debt" ? `/deudas/${o.id}` : `/prestamos/${o.id}`;
}

/** Color de estado: rojo si está vencida, verde si ya se saldó, el suyo si no */
export function toneOf(o: Pick<Obligation, "status" | "color">): string {
  if (o.status === "vencida") return "var(--os-magenta)";
  if (o.status === "pagada") return "var(--os-lime)";
  return o.color;
}

const DAY_MS = 86_400_000;
const shortFmt = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" });
const fullFmt = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric" });

function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Días calendario (hora local) hasta `ts`. Negativo = ya pasó. */
export function daysFromToday(ts: number): number {
  return Math.round((startOfDay(ts) - startOfDay(Date.now())) / DAY_MS);
}

export function formatShort(ts: number) {
  return shortFmt.format(ts).replace(".", "");
}

export function formatFull(ts: number) {
  return fullFmt.format(ts).replace(".", "");
}

/** "Vence hoy", "Vence en 3 días", "Venció hace 5 días", "Vence 12 oct" */
export function dueLabel(dueDate: number): { text: string; urgent: boolean; overdue: boolean } {
  const d = daysFromToday(dueDate);
  if (d < 0) return { text: `Venció hace ${-d} ${d === -1 ? "día" : "días"}`, urgent: true, overdue: true };
  if (d === 0) return { text: "Vence hoy", urgent: true, overdue: false };
  if (d === 1) return { text: "Vence mañana", urgent: true, overdue: false };
  if (d <= 7) return { text: `Vence en ${d} días`, urgent: true, overdue: false };
  return { text: `Vence ${formatShort(dueDate)}`, urgent: false, overdue: false };
}

/** Pocos caracteres para el centro del anillo: la inicial de la persona o del acreedor */
export function initialOf(text: string) {
  return text.trim().charAt(0).toUpperCase() || "·";
}
