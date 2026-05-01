import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import { withSentryConfig } from "@sentry/nextjs";

// Dominio personalizado de Clerk (ej. "clerk.danchest.cloud").
// Configurar en Vercel: CLERK_CSP_DOMAIN=clerk.danchest.cloud
// No usar NEXT_PUBLIC_CLERK_DOMAIN — Clerk lo interpreta y altera la carga de scripts.
const clerkCustomDomain = process.env.CLERK_CSP_DOMAIN;
const clerkSrc = [
  "https://*.clerk.accounts.dev",
  "https://clerk.accounts.dev",
  ...(clerkCustomDomain ? [`https://${clerkCustomDomain}`] : []),
].join(" ");

const csp = [
  "default-src 'self'",
  // Clerk inyecta scripts inline; Cloudflare Turnstile es requerido por Clerk para bot detection
  `script-src 'self' 'unsafe-inline' ${clerkSrc} https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://img.clerk.com https://images.clerk.dev",
  "font-src 'self' data:",
  // Convex (REST + WebSocket), Clerk, Sentry
  `connect-src 'self' https://*.convex.cloud wss://*.convex.cloud ${clerkSrc} https://*.sentry.io wss://*.sentry.io https://challenges.cloudflare.com`,
  // Clerk OAuth popups y Cloudflare Turnstile iframe
  `frame-src ${clerkSrc} https://challenges.cloudflare.com`,
  "frame-ancestors 'none'",
  // Serwist Service Worker
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Content-Security-Policy", value: csp },
];

const baseConfig: NextConfig = {
  turbopack: {},
  headers: async () => [{ source: "/(.*)", headers: securityHeaders }],
  images: {
    remotePatterns: [
      { hostname: "img.clerk.com" },
      { hostname: "images.clerk.dev" },
    ],
  },
};

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

// En dev: config base sin webpack plugins
// En prod: Serwist (SW) + Sentry (error tracking)
const productionConfig = withSentryConfig(
  withSerwist(baseConfig),
  {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    // Solo sube source maps si la clave está configurada
    authToken: process.env.SENTRY_AUTH_TOKEN,
    silent: true,
    telemetry: false,
  }
);

export default process.env.NODE_ENV === "production" ? productionConfig : baseConfig;
