// Textos de la cápsula de confirmación para deudas y préstamos. Siguen la forma
// de txConfirmation: arriba el monto y de qué se trata, abajo lo que cambia
// para la persona (cuánto falta, de dónde salió el dinero).
import { formatCents } from "./money";
import type { TxConfirmation } from "./txConfirmation";

// U+2212: el signo menos tipográfico, del mismo ancho que el +
const MINUS = "−";

export function buildDebtCreatedConfirmation(input: {
  name: string;
  creditor: string;
  amountCents: number;
  currency: string;
  monthlyPaymentCents?: number;
}): TxConfirmation {
  const cuota = input.monthlyPaymentCents
    ? ` · cuota de ${formatCents(input.monthlyPaymentCents, input.currency)}`
    : "";
  return {
    title: `${formatCents(input.amountCents, input.currency)} · ${input.name.trim()}`,
    detail: `Le debes a ${input.creditor.trim()}${cuota}`,
  };
}

export function buildLoanCreatedConfirmation(input: {
  borrower: string;
  amountCents: number;
  currency: string;
  /** Cuenta de la que salió el dinero, si se eligió una */
  accountName?: string;
}): TxConfirmation {
  const borrower = input.borrower.trim();
  const amount = formatCents(input.amountCents, input.currency);
  // Con cuenta de origen el dinero sí salió: lleva signo, como un gasto
  return input.accountName
    ? { title: `${MINUS}${amount} · Préstamo a ${borrower}`, detail: `Salió de la cuenta ${input.accountName}` }
    : { title: `${amount} · Préstamo a ${borrower}`, detail: `${borrower} te debe ${amount}` };
}

/** Al editar no cambia el monto, así que se confirma por el nombre */
export function buildObligationEditConfirmation(name: string): TxConfirmation {
  return { title: name.trim(), detail: "Cambios guardados" };
}

/**
 * Abono a una deuda o cobro de un préstamo. Si salda el total lo celebra; si no,
 * dice cuánto queda, que es lo primero que uno quiere saber después de pagar.
 */
export function buildPaymentConfirmation(input: {
  kind: "debt" | "loan";
  name: string;
  counterpart: string;
  amountCents: number;
  currency: string;
  /** Saldo pendiente ANTES del abono */
  balanceCents: number;
  originalAmountCents: number;
}): TxConfirmation {
  const fmt = (c: number) => formatCents(c, input.currency);
  const remaining = Math.max(0, input.balanceCents - input.amountCents);
  const name = input.name.trim();
  const who = input.counterpart.trim();

  if (input.kind === "debt") {
    return remaining === 0
      ? { title: "¡Deuda saldada!", detail: `${name} · ya no le debes nada a ${who}` }
      : { title: `${MINUS}${fmt(input.amountCents)} · ${name}`, detail: `Te quedan ${fmt(remaining)} por pagar` };
  }
  return remaining === 0
    ? { title: `¡${who} te pagó todo!`, detail: `Recuperaste los ${fmt(input.originalAmountCents)} que prestaste` }
    : { title: `+${fmt(input.amountCents)} · ${who}`, detail: `Aún te debe ${fmt(remaining)}` };
}
