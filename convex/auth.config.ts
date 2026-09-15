import type { AuthConfig } from "convex/server";
import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";

// Fase 2 de la migración a Better Auth (docs/migracion-better-auth.md): swap
// deliberado para validar el frontend en vivo contra la deployment de dev.
// Clerk queda desconectado del flujo de validación de JWT en Convex mientras
// dure esta fase — no puede convivir con Better Auth en este mismo arreglo
// (el plugin `convex` exige exactamente un provider con
// applicationID: "convex"). Rollback: restaurar el provider de Clerk de abajo.
//
// const authConfig = {
//   providers: [
//     { domain: process.env.CLERK_JWT_ISSUER_DOMAIN!, applicationID: "convex" },
//   ],
// } satisfies AuthConfig;
const authConfig = {
  providers: [getAuthConfigProvider()],
} satisfies AuthConfig;
export default authConfig;
