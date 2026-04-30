/**
 * Utilidades de Web Push para el cliente (browser).
 * Sólo funciona cuando el SW está activo (producción o build local).
 * En desarrollo el SW está deshabilitado → suscripción no disponible.
 */

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  // Loop explícito garantiza Uint8Array<ArrayBuffer> (no ArrayBufferLike)
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Verifica si el navegador soporta Web Push. */
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

/** Retorna el estado del permiso de notificaciones. */
export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/** Solicita permiso y suscribe al SW activo. Retorna null si falla o no soportado. */
export async function subscribeToWebPush(): Promise<PushSubscriptionPayload | null> {
  if (!isPushSupported()) return null;

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    console.warn("NEXT_PUBLIC_VAPID_PUBLIC_KEY no configurada");
    return null;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      // Cast necesario: TypeScript 5.7 distingue ArrayBuffer vs ArrayBufferLike
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as BufferSource,
    });

    const json = subscription.toJSON();
    const p256dh = json.keys?.p256dh;
    const auth   = json.keys?.auth;

    if (!p256dh || !auth) return null;

    return {
      endpoint: subscription.endpoint,
      keys: { p256dh, auth },
    };
  } catch (err) {
    console.error("subscribeToWebPush:", err);
    return null;
  }
}

/** Cancela la suscripción push del dispositivo actual. */
export async function unsubscribeFromWebPush(): Promise<string | null> {
  if (!isPushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return null;
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    return endpoint;
  } catch {
    return null;
  }
}

/** Retorna la suscripción actual (sin solicitar permiso). */
export async function getCurrentSubscription(): Promise<PushSubscriptionPayload | null> {
  if (!isPushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    const sub = await registration.pushManager.getSubscription();
    if (!sub) return null;
    const json = sub.toJSON();
    if (!json.keys?.p256dh || !json.keys?.auth) return null;
    return { endpoint: sub.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
  } catch {
    return null;
  }
}
