"use node";
import { internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const run = internalAction({
  args: {},
  handler: async (ctx: ActionCtx) => {
    const now = Date.now();
    const sinceTs = now - SEVEN_DAYS_MS;

    const userIds = await ctx.runQuery(internal.pushSubscriptions.listDistinctUserIds, {});
    if (userIds.length === 0) return;

    let sent = 0;
    for (const userId of userIds) {
      const summary = await ctx.runQuery(internal.transactions.getSummaryForPeriod, {
        userId,
        sinceTs,
      });

      if (summary.total === 0) continue;

      const body = `Esta semana: ${summary.ingresos} ingreso${summary.ingresos !== 1 ? "s" : ""} y ${summary.gastos} gasto${summary.gastos !== 1 ? "s" : ""} registrados.`;

      const notifId = await ctx.runMutation(internal.notifications.createInternal, {
        userId,
        type: "resumen_semanal",
        title: "Resumen de la semana",
        message: body,
        actionUrl: "/reportes",
      });

      await ctx.runAction(internal.actions.sendPushNotification.run, {
        userId,
        title: "📊 Resumen de la semana",
        body,
        url: "/reportes",
        notificationId: notifId,
      });
      sent++;
    }

    console.log(`sendWeeklySummary: ${sent} resúmenes enviados`);
  },
});
