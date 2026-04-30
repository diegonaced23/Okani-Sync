"use node";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import webpush from "web-push";

function getVapidConfig() {
  const publicKey  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject    = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey) return null;
  if (!subject) {
    console.error("sendPushNotification: VAPID_SUBJECT no configurada — define la variable de entorno");
    return null;
  }
  return { publicKey, privateKey, subject };
}

/** Envía una Web Push a todas las suscripciones activas del usuario. */
export const run = internalAction({
  args: {
    userId: v.string(),
    title: v.string(),
    body: v.string(),
    url: v.optional(v.string()),
    notificationId: v.optional(v.id("notifications")),
  },
  handler: async (ctx, args) => {
    const vapid = getVapidConfig();
    if (!vapid) {
      console.warn("sendPushNotification: VAPID keys no configuradas — omitiendo");
      return;
    }

    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

    const subs = await ctx.runQuery(internal.pushSubscriptions.listForUser, {
      userId: args.userId,
    });

    if (subs.length === 0) return;

    const payload = JSON.stringify({
      title: args.title,
      body: args.body,
      url: args.url ?? "/",
    });

    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            payload
          );
        } catch (err: unknown) {
          // 410 Gone = suscripción expirada → eliminar
          if (
            err &&
            typeof err === "object" &&
            "statusCode" in err &&
            (err as { statusCode: number }).statusCode === 410
          ) {
            await ctx.runMutation(internal.pushSubscriptions.removeByEndpoint, {
              endpoint: sub.endpoint,
            });
          } else {
            console.error(`sendPushNotification: error para ${sub.endpoint}`, err);
          }
        }
      })
    );

    // Marcar notificación como push enviado
    if (args.notificationId) {
      await ctx.runMutation(internal.notifications.markPushSent, {
        notificationId: args.notificationId,
      });
    }
  },
});
