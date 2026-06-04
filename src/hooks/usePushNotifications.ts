"use client";

import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  isPushSupported,
  getNotificationPermission,
  subscribeToWebPush,
  unsubscribeFromWebPush,
  getCurrentSubscription,
} from "@/lib/push";

export type PushStatus = "unsupported" | "denied" | "subscribed" | "unsubscribed" | "loading";

export function usePushNotifications() {
  const [status, setStatus] = useState<PushStatus>(() => {
    if (!isPushSupported()) return "unsupported";
    const perm = getNotificationPermission();
    if (perm === "denied") return "denied";
    return "loading";
  });
  const saveSubscription   = useMutation(api.pushSubscriptions.save);
  const removeSubscription = useMutation(api.pushSubscriptions.remove);

  useEffect(() => {
    if (!isPushSupported()) return;
    const perm = getNotificationPermission();
    if (perm === "denied") return;

    getCurrentSubscription().then(async (sub) => {
      if (sub) {
        setStatus("subscribed");
        return;
      }

      // El permiso ya fue concedido pero la suscripción del SW expiró → re-suscribir
      // silenciosamente sin mostrar ningún diálogo al usuario.
      if (perm === "granted") {
        try {
          const newSub = await subscribeToWebPush();
          if (newSub) {
            await saveSubscription({
              subscription: newSub,
              userAgent: navigator.userAgent.slice(0, 200),
            });
            setStatus("subscribed");
            return;
          }
        } catch {
          // Si falla el re-suscribe, caemos al estado "unsubscribed" para que el
          // banner aparezca y el usuario pueda reintentar manualmente.
        }
      }

      setStatus("unsubscribed");
    });
  }, [saveSubscription]);

  async function enable() {
    setStatus("loading");
    const sub = await subscribeToWebPush();
    if (!sub) {
      const perm = getNotificationPermission();
      setStatus(perm === "denied" ? "denied" : "unsubscribed");
      return false;
    }
    await saveSubscription({
      subscription: sub,
      userAgent: navigator.userAgent.slice(0, 200),
    });
    setStatus("subscribed");
    return true;
  }

  async function disable() {
    setStatus("loading");
    const endpoint = await unsubscribeFromWebPush();
    if (endpoint) {
      await removeSubscription({ endpoint });
    }
    setStatus("unsubscribed");
  }

  return { status, enable, disable };
}
