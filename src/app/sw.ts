/// <reference lib="webworker" />

import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist, NetworkFirst } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: WorkerGlobalScope &
  typeof globalThis & {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  };

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: /^https:\/\/.*\.convex\.cloud\/.*/,
      handler: new NetworkFirst({
        cacheName: "convex-cache",
        networkTimeoutSeconds: 5,
      }),
    },
  ],
});

// Listener de Web Push — recibe notificaciones del servidor
self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;

  interface PushPayload {
    title: string;
    body: string;
    url?: string;
  }

  const data = event.data.json() as PushPayload;

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/placeholder.svg",
      badge: "/icons/placeholder.svg",
      data: { url: data.url ?? "/" },
    })
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const { url } = event.notification.data as { url: string };

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((c) => c.url === url);
        if (existing && "focus" in existing) return existing.focus();
        return self.clients.openWindow(url);
      })
  );
});

serwist.addEventListeners();
