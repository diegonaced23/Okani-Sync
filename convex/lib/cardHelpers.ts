import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

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
