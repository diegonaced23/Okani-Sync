"use node";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { notify } from "../lib/notify";
import { ENDED_OCCURRENCE, nextOccurrenceAfter } from "../../src/lib/recurrence";

export const run = internalAction({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const due = await ctx.runQuery(internal.transactions.listDueRecurring, { now });
    if (due.length === 0) return;

    console.log(`processRecurringTransactions: ${due.length} plantillas a procesar`);

    const processed: Record<string, string[]> = {};

    for (const rec of due) {
      // listDueRecurring ya excluye los pausados; esto es solo defensa
      if (rec.paused) continue;

      // Validar fecha de fin — desactivar atomicamente (ya es mutación única)
      if (rec.endDate && rec.endDate < now) {
        await ctx.runMutation(internal.transactions.updateNextOccurrence, {
          recurringId: rec._id,
          nextOccurrence: ENDED_OCCURRENCE,
        });
        continue;
      }

      try {
        // Avanza desde la ocurrencia vencida (no desde `now`) para no correr la fecha
        const next = nextOccurrenceAfter(rec.frequency, rec.nextOccurrence, now, rec.dayOfMonth);

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
      await notify(ctx, {
        userId,
        type: "transaccion_recurrente",
        title: "Transacciones recurrentes procesadas",
        message: body,
        actionUrl: "/transacciones",
        push: {
          title: "🔄 Transacciones automáticas",
          body,
        },
      });
    }
  },
});
