"use node";
import { internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

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

    // 5. Préstamos vencidos
    await checkOverdueLoans(ctx, now);

    // 6. Préstamos próximos a vencer (en ≤ 7 días)
    await checkUpcomingLoans7Days(ctx, now);

    console.log("sendAlerts: ciclo completado", new Date(now).toISOString());
  },
});

async function checkUpcomingInstallments(
  ctx: ActionCtx,
  now: number
) {
  const cutoff = now + THREE_DAYS_MS;

  const upcoming = await ctx.runQuery(
    internal.cardInstallments.listUpcomingUnpaid,
    { afterTs: now, beforeTs: cutoff }
  );

  // Agrupar por tarjeta — una sola alerta por tarjeta, no por cuota individual
  const byCard = new Map<Id<"cards">, (typeof upcoming)[number][]>();
  for (const inst of upcoming) {
    if (!byCard.has(inst.cardId)) byCard.set(inst.cardId, []);
    byCard.get(inst.cardId)!.push(inst);
  }

  for (const [cardId, installments] of byCard) {
    const userId = installments[0].userId;

    // Deduplicar: no alertar si ya enviamos una notificación para esta tarjeta en los últimos 3 días
    const alreadyNotified = await ctx.runQuery(
      internal.notifications.existsRecentForEntity,
      { userId, type: "cuota_proxima", relatedEntityId: cardId as string, since: now - THREE_DAYS_MS }
    );
    if (alreadyNotified) continue;

    const card = await ctx.runQuery(internal.cards.getByIdInternal, { cardId });
    const cardName = card?.name ?? "tu tarjeta";
    const count = installments.length;
    const cuotaLabel = count > 1 ? `${count} cuotas` : "una cuota";

    const notifId = await ctx.runMutation(internal.notifications.createInternal, {
      userId,
      type: "cuota_proxima",
      title: "Cuota próxima a vencer",
      message: `${cardName} tiene ${cuotaLabel} venciendo en menos de 3 días.`,
      actionUrl: `/tarjetas/${cardId}`,
      relatedEntityId: cardId as string,
    });

    await ctx.runAction(internal.actions.sendPushNotification.run, {
      userId,
      title: "⏰ Cuota próxima a vencer",
      body: `${cardName} — ${cuotaLabel} vence en menos de 3 días.`,
      url: `/tarjetas/${cardId}`,
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

    // Crear notificación y marcar el presupuesto como notificado atómicamente.
    // Sin esto, un crash entre ambas operaciones causaría que el cron reenviara
    // la alerta en el siguiente ciclo.
    const notifId = await ctx.runMutation(internal.notifications.createAndMarkBudgetAlert, {
      userId: budget.userId,
      type,
      title: isOver ? "Presupuesto excedido" : `Presupuesto al ${percent}%`,
      message: isOver
        ? `Superaste el presupuesto de ${budget.categoryName ?? "una categoría"}.`
        : `Llevas el ${percent}% del presupuesto de ${budget.categoryName ?? "una categoría"}.`,
      actionUrl: "/presupuestos",
      relatedEntityId: budget._id,
      budgetId: budget._id,
      notifiedAt: now,
      exceeded: isOver,
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

async function checkOverdueLoans(ctx: ActionCtx, now: number) {
  const overdueLoans = await ctx.runQuery(internal.loans.listOverdue, { now });

  for (const loan of overdueLoans) {
    await ctx.runMutation(internal.loans.markOverdueInternal, { loanId: loan._id });

    const notifId = await ctx.runMutation(internal.notifications.createInternal, {
      userId: loan.userId,
      type: "prestamo_vencido",
      title: "Préstamo vencido",
      message: `El préstamo a ${loan.borrower} "${loan.name}" ha vencido.`,
      actionUrl: `/prestamos/${loan._id}`,
      relatedEntityId: loan._id,
    });

    await ctx.runAction(internal.actions.sendPushNotification.run, {
      userId: loan.userId,
      title: "💸 Préstamo vencido",
      body: `${loan.borrower} no ha devuelto "${loan.name}".`,
      url: `/prestamos/${loan._id}`,
      notificationId: notifId,
    });
  }
}

async function checkUpcomingLoans7Days(ctx: ActionCtx, now: number) {
  const beforeTs = now + SEVEN_DAYS_MS;
  const dueSoon = await ctx.runQuery(internal.loans.listDueSoon, { now, beforeTs });

  for (const loan of dueSoon) {
    if (!loan.dueDate) continue;
    const daysLeft = Math.ceil((loan.dueDate - now) / (24 * 60 * 60 * 1000));

    const notifId = await ctx.runMutation(internal.notifications.createInternal, {
      userId: loan.userId,
      type: "prestamo_proximo",
      title: "Préstamo próximo a vencer",
      message: `El préstamo a ${loan.borrower} vence en ${daysLeft} día${daysLeft !== 1 ? "s" : ""}.`,
      actionUrl: `/prestamos/${loan._id}`,
      relatedEntityId: loan._id,
    });

    await ctx.runAction(internal.actions.sendPushNotification.run, {
      userId: loan.userId,
      title: "⏰ Préstamo próximo a vencer",
      body: `${loan.borrower} debe devolver "${loan.name}" en ${daysLeft} día${daysLeft !== 1 ? "s" : ""}.`,
      url: `/prestamos/${loan._id}`,
      notificationId: notifId,
    });
  }
}
