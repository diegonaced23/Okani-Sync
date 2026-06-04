"use node";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

const FREQ_TO_MS: Record<string, number> = {
  diaria:    1 * 24 * 60 * 60 * 1000,
  semanal:   7 * 24 * 60 * 60 * 1000,
  quincenal: 15 * 24 * 60 * 60 * 1000,
  mensual:   30 * 24 * 60 * 60 * 1000, // aproximado; se ajusta por día del mes
  anual:     365 * 24 * 60 * 60 * 1000,
};

function nextOccurrenceAfter(frequency: string, fromTs: number, dayOfMonth?: number): number {
  if (frequency === "mensual" && dayOfMonth) {
    // Calcular mes destino sin overflow: si dayOfMonth > último día del mes destino,
    // clampear (ej: día 31 en febrero → 28). La próxima ocurrencia en marzo vuelve al 31.
    const d = new Date(fromTs);
    const rawMonth = d.getMonth() + 1;
    const targetYear = d.getFullYear() + Math.floor(rawMonth / 12);
    const targetMonth = rawMonth % 12;
    const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
    return new Date(targetYear, targetMonth, Math.min(dayOfMonth, lastDay), 0, 0, 0, 0).getTime();
  }
  if (frequency === "anual") {
    const d = new Date(fromTs);
    d.setFullYear(d.getFullYear() + 1);
    return d.getTime();
  }
  return fromTs + (FREQ_TO_MS[frequency] ?? FREQ_TO_MS.mensual);
}

export const run = internalAction({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const due = await ctx.runQuery(internal.transactions.listDueRecurring, { now });
    if (due.length === 0) return;

    console.log(`processRecurringTransactions: ${due.length} plantillas a procesar`);

    const processed: Record<string, string[]> = {};

    for (const rec of due) {
      // Validar fecha de fin — desactivar atomicamente (ya es mutación única)
      if (rec.endDate && rec.endDate < now) {
        await ctx.runMutation(internal.transactions.updateNextOccurrence, {
          recurringId: rec._id,
          nextOccurrence: Number.MAX_SAFE_INTEGER,
        });
        continue;
      }

      try {
        const next = nextOccurrenceAfter(rec.frequency, now, rec.dayOfMonth);

        if (rec.cardId && rec.type === "gasto") {
          // Gastos con tarjeta: crear compra y avanzar nextOccurrence atómicamente
          await ctx.runMutation(internal.cardPurchases.processRecurringCardOccurrence, {
            userId: rec.userId,
            cardId: rec.cardId,
            categoryId: rec.categoryId,
            description: rec.description,
            amount: rec.amount,
            date: now,
            recurringId: rec._id,
            nextOccurrence: next,
          });
        } else {
          // Transacción normal: crear y avanzar nextOccurrence atómicamente
          await ctx.runMutation(internal.transactions.processRecurringOccurrence, {
            userId: rec.userId,
            type: rec.type as "ingreso" | "gasto" | "pago_tarjeta" | "pago_deuda",
            amount: rec.amount,
            description: rec.description,
            date: now,
            currency: rec.currency,
            accountId: rec.accountId,
            categoryId: rec.categoryId,
            recurringId: rec._id,
            nextOccurrence: next,
          });
        }

        console.log(`processRecurringTransactions: generada tx para "${rec.description}"`);
        processed[rec.userId] = processed[rec.userId] ?? [];
        processed[rec.userId].push(rec.description);
      } catch (err) {
        console.error(`processRecurringTransactions: error en "${rec.description}"`, err);
      }
    }

    // Enviar push de resumen por usuario
    for (const [userId, descriptions] of Object.entries(processed)) {
      const count = descriptions.length;
      const body =
        count === 1
          ? `Se registró automáticamente: ${descriptions[0]}.`
          : `Se registraron ${count} transacciones recurrentes automáticamente.`;
      await ctx.runMutation(internal.notifications.createInternal, {
        userId,
        type: "transaccion_recurrente",
        title: "Transacciones recurrentes procesadas",
        message: body,
        actionUrl: "/transacciones",
      });
      await ctx.runAction(internal.actions.sendPushNotification.run, {
        userId,
        title: "🔄 Transacciones automáticas",
        body,
        url: "/transacciones",
      });
    }
  },
});
