import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { billDueInstallmentsForCard } from "./lib/cardBilling";

/** Cuotas que se leen por ejecución: acota el trabajo de una sola transacción. */
const BATCH = 200;

/**
 * Cron diario: factura las cuotas de tarjeta cuyo corte ya pasó.
 *
 * Por cada una registra el gasto de su capital y su interés, y suma el interés a
 * la deuda (ver `lib/cardBilling.ts`). Es idempotente: una cuota facturada queda
 * con `billedAt` y no vuelve a salir en el índice, así que un día perdido se cura
 * solo en la siguiente ejecución. Si quedan más de `BATCH` cuotas pendientes, se
 * vuelve a programar al instante con lo que falta.
 *
 * Va por el despachador de `cronRuns.ts`: perder una ejecución no pierde datos.
 */
export const billDue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const batch = await ctx.db
      .query("cardInstallments")
      .withIndex("by_billing_due", (q) =>
        q.eq("interestBilling", "at_cutoff").eq("billedAt", undefined).lte("dueDate", now)
      )
      .take(BATCH);

    const cardIds = [...new Set(batch.map((i) => i.cardId))];
    for (const cardId of cardIds) {
      await billDueInstallmentsForCard(ctx, cardId, now);
    }

    if (batch.length === BATCH) {
      await ctx.scheduler.runAfter(0, internal.cardBilling.billDue, {});
    }
    return { installments: batch.length, cards: cardIds.length };
  },
});
