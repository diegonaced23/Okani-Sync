import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { NotificationType } from "../../src/lib/notifications";

/**
 * Punto de control único de las notificaciones que generan los crons.
 *
 * Antes, cada aviso repetía el mismo par de llamadas (crear la notificación
 * in-app y disparar el push) en nueve sitios distintos y sin ningún filtro: los
 * jobs empujaban a todo usuario con suscripción. Ahora el par vive acá y pasa
 * primero por las preferencias del usuario.
 *
 * Devuelve el id de la notificación creada, o `null` si el usuario tiene
 * silenciada esa familia (ver src/lib/notifications.ts).
 */
export async function notify(
  ctx: ActionCtx,
  args: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    actionUrl?: string;
    relatedEntityId?: string;
    push: { title: string; body: string };
  }
): Promise<Id<"notifications"> | null> {
  if (!(await isNotificationEnabled(ctx, args.userId, args.type))) return null;

  const notificationId = await ctx.runMutation(internal.notifications.createInternal, {
    userId: args.userId,
    type: args.type,
    title: args.title,
    message: args.message,
    actionUrl: args.actionUrl,
    relatedEntityId: args.relatedEntityId,
  });

  await ctx.runAction(internal.actions.sendPushNotification.run, {
    userId: args.userId,
    title: args.push.title,
    body: args.push.body,
    url: args.actionUrl,
    notificationId,
  });

  return notificationId;
}

/**
 * Consulta suelta de la preferencia, para los call sites que no pueden usar
 * `notify` porque crean la notificación con una mutation propia — hoy solo las
 * alertas de presupuesto, que la crean y marcan el presupuesto como notificado
 * en la misma transacción a propósito.
 */
export async function isNotificationEnabled(
  ctx: ActionCtx,
  userId: string,
  type: NotificationType
): Promise<boolean> {
  return await ctx.runQuery(internal.users.isNotificationEnabledInternal, {
    userId,
    type,
  });
}
