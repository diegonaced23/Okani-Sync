"use node";
import { internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";

function getPreviousMonthString(now: number): string {
  const d = new Date(now);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getPreviousMonthStartTs(now: number): number {
  const d = new Date(now);
  d.setMonth(d.getMonth() - 1);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export const run = internalAction({
  args: {},
  handler: async (ctx: ActionCtx) => {
    const now = Date.now();
    const prevMonth = getPreviousMonthString(now);
    const prevMonthStartTs = getPreviousMonthStartTs(now);

    const [year, month] = prevMonth.split("-");
    const monthNames: Record<string, string> = {
      "01": "enero", "02": "febrero", "03": "marzo", "04": "abril",
      "05": "mayo", "06": "junio", "07": "julio", "08": "agosto",
      "09": "septiembre", "10": "octubre", "11": "noviembre", "12": "diciembre",
    };
    const monthLabel = `${monthNames[month] ?? month} ${year}`;

    const userIds = await ctx.runQuery(internal.pushSubscriptions.listDistinctUserIds, {});
    if (userIds.length === 0) return;

    let sent = 0;
    for (const userId of userIds) {
      const summary = await ctx.runQuery(internal.transactions.getSummaryForPeriod, {
        userId,
        sinceTs: prevMonthStartTs,
      });

      if (summary.total === 0) continue;

      const body = `${summary.ingresos} ingreso${summary.ingresos !== 1 ? "s" : ""} y ${summary.gastos} gasto${summary.gastos !== 1 ? "s" : ""} en ${monthLabel}.`;

      const notifId = await ctx.runMutation(internal.notifications.createInternal, {
        userId,
        type: "resumen_mensual",
        title: `Resumen de ${monthLabel}`,
        message: body,
        actionUrl: "/reportes",
      });

      await ctx.runAction(internal.actions.sendPushNotification.run, {
        userId,
        title: `📅 Resumen de ${monthLabel}`,
        body,
        url: "/reportes",
        notificationId: notifId,
      });
      sent++;
    }

    console.log(`sendMonthlySummary: ${sent} resúmenes de ${prevMonth} enviados`);
  },
});
