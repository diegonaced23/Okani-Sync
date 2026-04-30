import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Solo activo en producción
  enabled: process.env.NODE_ENV === "production",

  // Captura el 10% de las transacciones de rendimiento
  tracesSampleRate: 0.1,

  // Captura el 100% de los replays cuando hay un error
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.01,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
});
