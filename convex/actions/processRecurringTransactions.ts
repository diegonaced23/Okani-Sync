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
    const d = new Date(fromTs);
    d.setMonth(d.getMonth() + 1);
    d.setDate(dayOfMonth);
    return d.getTime();
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

    for (const rec of due) {
      // Validar fecha de fin
      if (rec.endDate && rec.endDate < now) {
        await ctx.runMutation(internal.transactions.updateNextOccurrence, {
          recurringId: rec._id,
          nextOccurrence: Number.MAX_SAFE_INTEGER, // efectivamente desactiva
        });
        continue;
      }

      try {
        await ctx.runMutation(internal.transactions.createInternal, {
          userId: rec.userId,
          type: rec.type as "ingreso" | "gasto",
          amount: rec.amount,
          description: rec.description,
          date: now,
          currency: rec.currency,
          accountId: rec.accountId,
          categoryId: rec.categoryId,
          recurringId: rec._id,
        });

        const next = nextOccurrenceAfter(rec.frequency, now, rec.dayOfMonth);
        await ctx.runMutation(internal.transactions.updateNextOccurrence, {
          recurringId: rec._id,
          nextOccurrence: next,
        });

        console.log(`processRecurringTransactions: generada tx para "${rec.description}"`);
      } catch (err) {
        console.error(`processRecurringTransactions: error en "${rec.description}"`, err);
      }
    }
  },
});
