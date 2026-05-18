import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

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
 * Recalcula `cardInstallments.paid` para una tarjeta usando FIFO por dueDate.
 * Compara el total pagado (totalCargado - currentBalance) contra el cronograma.
 * Se invoca tras cualquier pago o reversión de pago.
 */
export async function recomputeInstallmentsPaid(
  ctx: MutationCtx,
  cardId: Id<"cards">
) {
  const card = await ctx.db.get(cardId);
  if (!card) return;

  // Total cargado = suma de todas las txs gasto_tarjeta de la tarjeta
  const gastosTarjeta = await ctx.db
    .query("transactions")
    .withIndex("by_card", (q) => q.eq("cardId", cardId))
    .filter((q) => q.eq(q.field("type"), "gasto_tarjeta"))
    .collect();
  const totalCargado = gastosTarjeta.reduce((s, t) => s + t.amount, 0);
  const totalPagado = Math.max(0, totalCargado - card.currentBalance);

  const installments = await ctx.db
    .query("cardInstallments")
    .withIndex("by_card_month", (q) => q.eq("cardId", cardId))
    .collect();

  // Ordenar por dueDate asc para FIFO
  const sorted = [...installments].sort((a, b) => a.dueDate - b.dueDate);

  let acumulado = 0;
  const now = Date.now();
  for (const inst of sorted) {
    const shouldBePaid = acumulado + inst.amount <= totalPagado;
    if (shouldBePaid !== inst.paid) {
      await ctx.db.patch(inst._id, {
        paid: shouldBePaid,
        paidAt: shouldBePaid ? now : undefined,
      });
    }
    if (shouldBePaid) acumulado += inst.amount;
  }

  // Actualizar paidInstallments y status en cardPurchases
  const purchases = await ctx.db
    .query("cardPurchases")
    .withIndex("by_card", (q) => q.eq("cardId", cardId))
    .collect();
  for (const purchase of purchases) {
    const purchaseInsts = sorted.filter((i) => i.purchaseId === purchase._id);
    const paidCount = purchaseInsts.filter((i) => i.paid).length;
    const fullyPaid = paidCount >= purchase.totalInstallments;
    const newStatus = fullyPaid ? "pagada" : "activa";
    if (paidCount !== purchase.paidInstallments || newStatus !== purchase.status) {
      await ctx.db.patch(purchase._id, {
        paidInstallments: paidCount,
        status: newStatus,
        updatedAt: now,
      });
    }
  }
}
