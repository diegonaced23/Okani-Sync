import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { allocatePayments, installmentDue, totalPaidFor } from "../../src/lib/cardPayments";

/**
 * Calcula las fechas de inicio y fin del ciclo de facturación actual
 * basándose en el día de corte de la tarjeta.
 * Exportada aquí para que tanto queries como mutations la reutilicen.
 *
 * Ejemplo: cutoffDay=25, hoy=17 may → ciclo [25 abr 23:59, 25 may 23:59].
 */
export function getBillingCycleDates(cutoffDay: number): {
  prevCutoffTs: number;
  nextCutoffTs: number;
} {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const day = now.getDate();

  // Día de corte clampeado al último día real del mes (ej: 31 en febrero → 28)
  const cutoffOf = (y: number, m: number) =>
    Math.min(cutoffDay, new Date(y, m + 1, 0).getDate());

  let prevYear: number, prevMonth: number, nextYear: number, nextMonth: number;

  if (day >= cutoffOf(year, month)) {
    // Ya pasamos el corte → ciclo: [corte este mes → corte próximo mes]
    prevYear = year; prevMonth = month;
    nextYear = month === 11 ? year + 1 : year;
    nextMonth = month === 11 ? 0 : month + 1;
  } else {
    // Antes del corte → ciclo: [corte mes pasado → corte este mes]
    prevYear = month === 0 ? year - 1 : year;
    prevMonth = month === 0 ? 11 : month - 1;
    nextYear = year; nextMonth = month;
  }

  // Fin del día del corte para incluir operaciones realizadas ese mismo día
  const prevCutoffTs = new Date(prevYear, prevMonth, cutoffOf(prevYear, prevMonth), 23, 59, 59, 999).getTime();
  const nextCutoffTs = new Date(nextYear, nextMonth, cutoffOf(nextYear, nextMonth), 23, 59, 59, 999).getTime();

  return { prevCutoffTs, nextCutoffTs };
}

/**
 * Calcula el timestamp de la próxima fecha de pago de la tarjeta.
 * El pago cae en el mes siguiente al próximo corte (lógica bancaria estándar).
 */
export function getNextPaymentTs(paymentDay: number, nextCutoffTs: number): number {
  const cutoffDate = new Date(nextCutoffTs);
  const cutoffMonth = cutoffDate.getMonth();
  const cutoffYear = cutoffDate.getFullYear();

  // El pago es el mes siguiente al corte
  const payYear = cutoffMonth === 11 ? cutoffYear + 1 : cutoffYear;
  const payMonth = cutoffMonth === 11 ? 0 : cutoffMonth + 1;
  const lastDay = new Date(payYear, payMonth + 1, 0).getDate();
  const clampedDay = Math.min(paymentDay, lastDay);

  return new Date(payYear, payMonth, clampedDay, 12, 0, 0).getTime();
}

/**
 * Recalcula lo abonado a cada cuota a partir de la deuda de la tarjeta.
 *
 * Lo pagado se deduce (lo que cargaron las cuotas menos lo que aún se debe) y se
 * reparte de la más antigua a la más nueva con `allocatePayments`, la misma
 * función que usa la vista previa de la hoja de pago. Guarda `paidAmount`, y de
 * él `paid`; y en cada compra, cuántas cuotas van pagadas y si ya está saldada.
 * Se invoca tras cualquier pago, reversión, facturación o cambio de compras.
 */
export async function recomputeInstallmentsPaid(ctx: MutationCtx, cardId: Id<"cards">) {
  const card = await ctx.db.get(cardId);
  if (!card) return;

  const installments = await ctx.db
    .query("cardInstallments")
    .withIndex("by_card_month", (q) => q.eq("cardId", cardId))
    .collect();

  const items = installments.map((i) => ({ due: installmentDue(i), dueDate: i.dueDate }));
  const paidAmounts = allocatePayments(items, totalPaidFor(items, card.currentBalance));

  const now = Date.now();
  const paidByPurchase = new Map<string, number>();
  for (let idx = 0; idx < installments.length; idx++) {
    const inst = installments[idx];
    const paidAmount = paidAmounts[idx];
    // Pagada = no debe nada hoy. Una cuota futura con su capital abonado queda
    // pagada; si al facturarse le llega un interés, vuelve a deber ese interés.
    const paid = paidAmount >= items[idx].due;
    if (paid) paidByPurchase.set(inst.purchaseId, (paidByPurchase.get(inst.purchaseId) ?? 0) + 1);
    if (paidAmount !== inst.paidAmount || paid !== inst.paid) {
      await ctx.db.patch(inst._id, {
        paidAmount,
        paid,
        paidAt: paid ? (inst.paidAt ?? now) : undefined,
      });
    }
  }

  const purchases = await ctx.db
    .query("cardPurchases")
    .withIndex("by_card", (q) => q.eq("cardId", cardId))
    .collect();
  for (const purchase of purchases) {
    if (purchase.status === "cancelada") continue;
    const paidCount = paidByPurchase.get(purchase._id) ?? 0;
    const status = paidCount >= purchase.totalInstallments ? "pagada" : "activa";
    if (paidCount !== purchase.paidInstallments || status !== purchase.status) {
      await ctx.db.patch(purchase._id, { paidInstallments: paidCount, status, updatedAt: now });
    }
  }
}
