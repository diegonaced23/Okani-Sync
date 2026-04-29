import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import { withSentryConfig } from "@sentry/nextjs";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
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
