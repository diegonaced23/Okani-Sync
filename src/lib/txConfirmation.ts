// Texto de la confirmación que reemplaza al toast al registrar un movimiento:
// dice qué pasó con el dinero, no solo que la acción terminó.
import { formatCents } from "./money";

export interface TxConfirmation {
  /** Monto con signo y descripción: "−$ 45.000 · Mercado" */
  title: string;
  /** De dónde salió o a dónde llegó: "desde la cuenta Bancolombia" */
  detail: string;
}

type TxConfirmationInput =
  | { kind: "gasto" | "ingreso"; amountCents: number; currency: string; description: string; accountName?: string }
  | { kind: "compra_tarjeta"; amountCents: number; currency: string; description: string; cardName: string; installments: number };

// U+2212: el signo menos tipográfico, del mismo ancho que el +
const MINUS = "−";

export function buildTxConfirmation(input: TxConfirmationInput): TxConfirmation {
  const sign = input.kind === "ingreso" ? "+" : MINUS;
  const title = `${sign}${formatCents(Math.abs(input.amountCents), input.currency)} · ${input.description.trim()}`;

  if (input.kind === "compra_tarjeta") {
    const cuotas = input.installments > 1 ? ` a ${input.installments} cuotas` : "";
    return { title, detail: `con la tarjeta ${input.cardName}${cuotas}` };
  }

  // Sin nombre de cuenta (no debería pasar: el formulario exige una) se omite el
  // detalle antes que inventarlo
  if (!input.accountName) {
    return { title, detail: input.kind === "ingreso" ? "Ingreso registrado" : "Gasto registrado" };
  }
  const prep = input.kind === "ingreso" ? "a" : "desde";
  return { title, detail: `${prep} la cuenta ${input.accountName}` };
}

/**
 * Confirmación al editar: repite el monto y la descripción como quedaron, para
 * que se vea el resultado y no solo que se guardó. Los tipos que no son entrada
 * ni salida de dinero (transferencias, pagos, ajustes) van sin signo ni monto.
 */
export function buildEditConfirmation(input: {
  type: string;
  amountCents: number;
  currency: string;
  description: string;
}): TxConfirmation {
  const desc = input.description.trim();
  const sign = input.type === "ingreso" ? "+" : input.type === "gasto" || input.type === "gasto_tarjeta" ? MINUS : null;
  if (sign === null) {
    return { title: desc, detail: input.type === "transferencia" ? "Transferencia actualizada" : "Cambios guardados" };
  }
  return {
    title: `${sign}${formatCents(Math.abs(input.amountCents), input.currency)} · ${desc}`,
    detail: "Cambios guardados",
  };
}

/**
 * Confirmación de una transferencia: el monto que sale y su descripción, y
 * debajo el trayecto. Con monedas distintas añade cuánto llega, que es el dato
 * que no se ve en el formulario una vez cerrado.
 */
export function buildTransferConfirmation(input: {
  amountCents: number;
  currency: string;
  description: string;
  fromName: string;
  toName: string;
  /** Solo si el destino tiene otra moneda */
  received?: { amountCents: number; currency: string };
}): TxConfirmation {
  const title = `${formatCents(Math.abs(input.amountCents), input.currency)} · ${input.description.trim() || "Transferencia"}`;
  const route = `de ${input.fromName} a ${input.toName}`;
  const detail = input.received
    ? `${route} · llegan ${formatCents(input.received.amountCents, input.received.currency)}`
    : route;
  return { title, detail };
}
