"use node";
import { internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Colombia es UTC-5 (sin DST). El cron dispara a las 00:00 UTC = 19:00 Colombia.
 * "Hoy" en Colombia: desde las 05:00 UTC del día anterior hasta las 05:00 UTC del día actual.
 * Calculamos el inicio del día Colombia como: now - 19h (cuando el cron corre a medianoche UTC).
 */
function getStartOfColombiaDay(now: number): number {
  const COLOMBIA_OFFSET_MS = 5 * 60 * 60 * 1000;
  const localNow = now - COLOMBIA_OFFSET_MS;
  const dayMs = 24 * 60 * 60 * 1000;
  const startOfLocalDay = localNow - (localNow % dayMs);
  return startOfLocalDay + COLOMBIA_OFFSET_MS;
}

export const run = internalAction({
  args: {},
  handler: async (ctx: ActionCtx) => {
    const now = Date.now();
    const startOfToday = getStartOfColombiaDay(now);

    const userIds = await ctx.runQuery(internal.pushSubscriptions.listDistinctUserIds, {});
    if (userIds.length === 0) return;

    let sent = 0;
    for (const userId of userIds) {
      const hasTransactions = await ctx.runQuery(
        internal.transactions.hadTransactionsToday,
        { userId, sinceTs: startOfToday }
      );
      if (hasTransactions) continue;

      const notifId = await ctx.runMutation(internal.notifications.createInternal, {
        userId,
        type: "recordatorio_registro",
        title: "¿Ya registraste hoy?",
        message: "Lleva tus finanzas al día. Registra tus gastos de hoy en Okany.",
        actionUrl: "/transacciones?nuevo=true",
      });

      await ctx.runAction(internal.actions.sendPushNotification.run, {
        userId,
        title: "📝 ¿Ya registraste hoy?",
        body: "Lleva tus finanzas al día. Registra tus gastos de hoy.",
        url: "/transacciones?nuevo=true",
        notificationId: notifId,
      });
      sent++;
    }

    console.log(`sendDailyReminder: ${sent} recordatorios enviados de ${userIds.length} usuarios`);
  },
});
