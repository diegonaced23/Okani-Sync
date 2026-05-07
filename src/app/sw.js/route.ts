/**
 * Sirve el Service Worker como una ruta de App Router.
 * Razón: los archivos de public/ no se sirven correctamente en el deployment de Vercel.
 * Esta ruta bypasea el problema sirviendo el SW directamente desde el runtime de Next.js.
 */

const SW_CONTENT = `
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/placeholder.svg',
      badge: '/icons/placeholder.svg',
      data: { url: data.url ?? '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '/';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((c) => c.url === url);
        if (existing && 'focus' in existing) return existing.focus();
        return self.clients.openWindow(url);
      })
  );
});
`.trim();

export function GET() {
  return new Response(SW_CONTENT, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Service-Worker-Allowed": "/",
    },
  });
}
