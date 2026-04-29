import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const baseConfig: NextConfig = {
  // Turbopack explícito: evita el conflicto con plugins webpack en Next.js 16.
  // Serwist (que usa webpack) solo se aplica en `next build`, no en `next dev`.
  turbopack: {},
  headers: async () => [{ source: "/(.*)", headers: securityHeaders }],
  images: {
    remotePatterns: [
      { hostname: "img.clerk.com" },
      { hostname: "images.clerk.dev" },
    ],
  },
};

// En producción envolvemos con Serwist para generar el Service Worker.
// En desarrollo Turbopack no necesita webpack, y el SW está deshabilitado de todas formas.
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

export default process.env.NODE_ENV === "production"
  ? withSerwist(baseConfig)
  : baseConfig;
