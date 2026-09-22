import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { billDueInstallmentsForCard } from "./lib/cardBilling";

/** Cuotas que se leen por ejecución: acota el trabajo de una sola transacción. */
const BATCH = 200;

/**
 * Cron diario: pone al día las cuotas de tarjeta.
 *
 * Son dos momentos distintos por cuota (ver `lib/cardSchedule.ts`):
 * - **el gasto**, cuando llega su fecha (la compra más un mes por cuota): se
 *   registra el movimiento del capital en su mes;
 * - **el interés**, cuando la cuota entra al extracto en el corte: se registra su
 *   movimiento y se suma a la deuda.
 *
 * Es idempotente: una cuota ya registrada queda con `expensedAt`, y una ya
 * facturada con `billedAt`, así que dejan de salir en los índices y un día
 * perdido se cura solo en la siguiente ejecución. Si queda más trabajo del que
 * cabe en `BATCH`, se vuelve a programar al instante.
 *
 * Va por el despachador de `cronRuns.ts`: perder una ejecución no pierde datos.
 */
export const billDue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const [porGastar, porFacturar] = await Promise.all([
      ctx.db
        .query("cardInstallments")
        .withIndex("by_expense_due", (q) =>
          q.eq("interestBilling", "at_cutoff").eq("expensedAt", undefined).lte("expenseDate", now)
        )
        .take(BATCH),
      ctx.db
        .query("cardInstallments")
        .withIndex("by_billing_due", (q) =>
          q.eq("interestBilling", "at_cutoff").eq("billedAt", undefined).lte("dueDate", now)
        )
        .take(BATCH),
    ]);

    const batch = [...porGastar, ...porFacturar];
    const cardIds = [...new Set(batch.map((i) => i.cardId))];
    for (const cardId of cardIds) {
      await billDueInstallmentsForCard(ctx, cardId, now);
    }

    if (porGastar.length === BATCH || porFacturar.length === BATCH) {
      await ctx.scheduler.runAfter(0, internal.cardBilling.billDue, {});
    }
    return { gastos: porGastar.length, facturadas: porFacturar.length, cards: cardIds.length };
  },
});
