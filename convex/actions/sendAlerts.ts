"use node";
import { internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export const run = internalAction({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // 1. Cuotas de tarjeta próximas (vencen en ≤ 3 días, no pagadas)
    await checkUpcomingInstallments(ctx, now);

    // 2. Presupuestos que superaron el umbral de alerta
    await checkBudgetAlerts(ctx, now);

    // 3. Deudas vencidas (dueDate pasado y status=activa)
    await checkOverdueDebts(ctx, now);

    // 4. Deudas próximas a vencer (en ≤ 7 días)
    await checkUpcomingDebts7Days(ctx, now);

    console.log("sendAlerts: ciclo completado", new Date(now).toISOString());
  },
});

async function checkUpcomingInstallments(
  ctx: ActionCtx,
  now: number
) {
  const cutoff = now + THREE_DAYS_MS;

  // Obtener todos los usuarios con cuotas próximas venciendo
  const upcoming = await ctx.runQuery(
    internal.cardInstallments.listUpcomingUnpaid,
    { afterTs: now, beforeTs: cutoff }
  );

  for (const inst of upcoming) {
    // Verificar que no hayamos notificado ya en las últimas 24h
    const notifId = await ctx.runMutation(internal.notifications.createInternal, {
      userId: inst.userId,
      type: "cuota_proxima",
      title: "Cuota próxima a vencer",
      message: `Tienes una cuota de tarjeta por ${inst.amount} que vence pronto.`,
      actionUrl: `/tarjetas/${inst.cardId}`,
      relatedEntityId: inst._id,
    });

    await ctx.runAction(internal.actions.sendPushNotification.run, {
      userId: inst.userId,
      title: "⏰ Cuota próxima a vencer",
      body: `Cuota #${inst.installmentNumber} vence en menos de 3 días.`,
      url: `/tarjetas/${inst.cardId}`,
      notificationId: notifId,
    });
  }
}

async function checkBudgetAlerts(
  ctx: ActionCtx,
  now: number
) {
  const alerts = await ctx.runQuery(
    internal.budgets.listExceedingThreshold,
    {}
  );

  for (const budget of alerts) {
    const percent = budget.amount > 0
      ? Math.round((budget.spent / budget.amount) * 100)
      : 0;
    const isOver = budget.spent > budget.amount;
    const type = isOver ? "presupuesto_excedido" : "presupuesto_alerta";

    const notifId = await ctx.runMutation(internal.notifications.createInternal, {
      userId: budget.userId,
      type,
      title: isOver ? "Presupuesto excedido" : `Presupuesto al ${percent}%`,
      message: isOver
        ? `Superaste el presupuesto de ${budget.categoryName ?? "una categoría"}.`
        : `Llevas el ${percent}% del presupuesto de ${budget.categoryName ?? "una categoría"}.`,
      actionUrl: "/presupuestos",
      relatedEntityId: budget._id,
    });

    // Actualizar notifiedAt para no volver a alertar este mes
    await ctx.runMutation(internal.budgets.updateNotifiedAt, {
      budgetId: budget._id,
      notifiedAt: now,
    });

    await ctx.runAction(internal.actions.sendPushNotification.run, {
      userId: budget.userId,
      title: isOver ? "🚨 Presupuesto excedido" : `⚠️ Presupuesto al ${percent}%`,
      body: isOver
        ? `Has superado el presupuesto de ${budget.categoryName ?? "una categoría"}.`
        : `Llevas el ${percent}% del presupuesto de ${budget.categoryName ?? "una categoría"}.`,
      url: "/presupuestos",
      notificationId: notifId,
    });
  }
}

async function checkOverdueDebts(
  ctx: ActionCtx,
  now: number
) {
  const overdueDebts = await ctx.runQuery(
    internal.debts.listOverdue,
    { now }
  );

  for (const debt of overdueDebts) {
    // Marcar como vencida
    await ctx.runMutation(internal.debts.markOverdueInternal, {
      debtId: debt._id,
    });

    const notifId = await ctx.runMutation(internal.notifications.createInternal, {
      userId: debt.userId,
      type: "deuda_vencida",
      title: "Deuda vencida",
      message: `La deuda "${debt.name}" con ${debt.creditor} ha vencido.`,
      actionUrl: "/deudas",
      relatedEntityId: debt._id,
    });

    await ctx.runAction(internal.actions.sendPushNotification.run, {
      userId: debt.userId,
      title: "🔴 Deuda vencida",
      body: `"${debt.name}" con ${debt.creditor} está vencida.`,
      url: "/deudas",
      notificationId: notifId,
    });
  }
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

async function checkUpcomingDebts7Days(ctx: ActionCtx, now: number) {
  const beforeTs = now + SEVEN_DAYS_MS;
  const dueSoon = await ctx.runQuery(internal.debts.listDueSoon, { now, beforeTs });

  for (const debt of dueSoon) {
    if (!debt.dueDate) continue;
    const daysLeft = Math.ceil((debt.dueDate - now) / (24 * 60 * 60 * 1000));

    const notifId = await ctx.runMutation(internal.notifications.createInternal, {
      userId: debt.userId,
      type: "deuda_proxima",
      title: "Deuda próxima a vencer",
      message: `"${debt.name}" con ${debt.creditor} vence en ${daysLeft} día${daysLeft !== 1 ? "s" : ""}.`,
      actionUrl: "/deudas",
      relatedEntityId: debt._id,
    });

    await ctx.runAction(internal.actions.sendPushNotification.run, {
      userId: debt.userId,
      title: "⚠️ Deuda próxima a vencer",
      body: `"${debt.name}" vence en ${daysLeft} día${daysLeft !== 1 ? "s" : ""}.`,
      url: "/deudas",
      notificationId: notifId,
    });
  }
}
