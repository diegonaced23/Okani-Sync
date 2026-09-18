import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const isDev = process.env.NODE_ENV !== "production";

// Tras la migración a Better Auth (ver docs/migracion-better-auth.md) el login
// ya no carga nada de Clerk ni de Cloudflare Turnstile: todo va por /api/auth
// (mismo origen). Solo quedan los hosts de imagen de Clerk, porque los usuarios
// que tenían foto antes de la migración la siguen sirviendo desde ahí
// (`users.imageUrl`, heredado). Quitarlos cuando nadie dependa de ese campo.
const legacyClerkImages = "https://img.clerk.com https://images.clerk.dev";

const csp = [
  "default-src 'self'",
  // 'unsafe-inline': scripts inline de Next.js (hidratación) sin nonce.
  // 'wasm-unsafe-eval': necesario para @react-pdf/renderer (WebAssembly). Más seguro que 'unsafe-eval'.
  // 'unsafe-eval': requerido por React en desarrollo para reconstruir call stacks (solo dev).
  // va.vercel-scripts.com: Speed Insights carga su script de depuración desde ahí solo en
  // desarrollo; en producción lo sirve Vercel desde el mismo origen (/_vercel/...).
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval' https://va.vercel-scripts.com" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // *.convex.cloud: avatares subidos por el usuario (URLs de Convex storage)
  `img-src 'self' data: blob: https://*.convex.cloud ${legacyClerkImages}`,
  "font-src 'self' data:",
  // Convex (REST + WebSocket), Sentry
  "connect-src 'self' https://*.convex.cloud wss://*.convex.cloud https://*.sentry.io wss://*.sentry.io",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  // Service Worker (src/app/sw.js/route.ts)
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
  // La ruta de acceso se llamó /sign-in hasta 2026-09-17. Los correos de magic
  // link y de recuperación que ya salieron llevan ese enlace dentro
  // (convex/lib/emailTemplates.ts), y una bandeja de entrada no se puede
  // reescribir: sin este redirect esos accesos quedarían en 404. Mantener
  // mientras puedan seguir vivos enlaces antiguos.
  redirects: async () => [
    { source: "/sign-in", destination: "/login", permanent: true },
  ],
  images: {
    remotePatterns: [
      { hostname: "img.clerk.com" },
      { hostname: "images.clerk.dev" },
    ],
  },
};

// En dev: config base sin webpack plugins
// En prod: Sentry (error tracking)
const productionConfig = withSentryConfig(
  baseConfig,
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
