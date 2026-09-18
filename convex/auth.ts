import { betterAuth } from "better-auth/minimal";
import { magicLink } from "better-auth/plugins/magic-link";
import { createClient, type AuthFunctions, type GenericCtx } from "@convex-dev/better-auth";
import { convex as convexPlugin } from "@convex-dev/better-auth/plugins";
import { requireActionCtx } from "@convex-dev/better-auth/utils";
import { MAGIC_LINK_EXPIRES_IN_SECONDS } from "../src/lib/constants";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfigFile from "./auth.config";

// ─── Migración Clerk → Better Auth ────────────────────────────────────────────
// Ver docs/migracion-better-auth.md. `clerkId` en la tabla `users` de la app
// NUNCA se toca — sigue siendo el identificador que usan todas las tablas de
// negocio. `authId` es el puente: se vincula por email la primera vez que cada
// usuario existente se autentica bajo Better Auth (trigger onCreate abajo,
// con `ensureExists` en convex/users.ts como respaldo idempotente si el
// trigger no pudo vincular — ver ese archivo para el motivo).

const authFunctions: AuthFunctions = internal.auth;

export const authComponent = createClient<DataModel>(components.betterAuth, {
  authFunctions,
  triggers: {
    user: {
      onCreate: async (ctx, doc) => {
        // Solo se vincula por email si Better Auth ya verificó la posesión del
        // correo (magic link, o un reset de contraseña ya autenticado). Sin
        // este gate, cualquiera podría hacer sign-up con el email de un
        // usuario real y "robar" el vínculo authId de su cuenta antes de que
        // esa persona migre — ver docs/migracion-better-auth.md.
        if (!doc.emailVerified) return;

        const email = doc.email.toLowerCase().trim();
        const legacy = await ctx.db
          .query("users")
          .withIndex("by_email", (q) => q.eq("email", email))
          .unique();

        if (legacy) {
          // También se re-vincula si el authId guardado quedó huérfano (el
          // usuario de Better Auth anterior se borró): ver ensureExists.
          const orphaned =
            legacy.authId !== undefined &&
            (await authComponent.getAnyUserById(ctx, legacy.authId)) === null;
          if (legacy.authId === undefined || orphaned) {
            await ctx.db.patch(legacy._id, { authId: doc._id });
          }
          return;
        }

        // Usuario genuinamente nuevo (no existía antes de la migración). El
        // gate de invitación real vive en convex/users.ts::ensureExists, que
        // corre después del primer login desde AuthGuard — acá no se crea
        // nada para no duplicar esa lógica de negocio.
      },
    },
  },
});

export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi();

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    baseURL: process.env.SITE_URL,
    database: authComponent.adapter(ctx),
    // Sesiones "frescas" ilimitadas (default: 24h) — sin esto,
    // authClient.listSessions() (perfil, sección "Sesiones activas") empieza a
    // fallar con SESSION_NOT_FRESH pasado un día de la última autenticación.
    session: { freshAge: 0 },
    emailAndPassword: {
      enabled: true,
      // Bloquea /sign-up/email: sin esto, cualquiera podría registrarse con el
      // email de un usuario real y el trigger onCreate (o ensureExists)
      // vincularía authId a esa cuenta — ver docs/migracion-better-auth.md.
      // El único camino para entrar sigue siendo el magic link (prueba
      // posesión del email) o, para contraseña, el reset con token.
      disableSignUp: true,
      sendResetPassword: async ({ user, url }) => {
        await requireActionCtx(ctx).runAction(
          internal.actions.sendResetPasswordEmail.run,
          { email: user.email, url }
        );
      },
    },
    plugins: [
      magicLink({
        // Sin esto el plugin usa 300 s (5 min) — ver
        // node_modules/better-auth/dist/plugins/magic-link/index.mjs. Demasiado
        // corto para un enlace que llega por correo; ver el comentario de la
        // constante en src/lib/constants.ts.
        expiresIn: MAGIC_LINK_EXPIRES_IN_SECONDS,
        sendMagicLink: async ({ email, url }) => {
          await requireActionCtx(ctx).runAction(
            internal.actions.sendMagicLinkEmail.run,
            { email, url }
          );
        },
      }),
      convexPlugin({
        authConfig: authConfigFile,
        // Autosana un mismatch de algoritmo en el JWKS (EdDSA vs RS256) que
        // pudo quedar de los swaps de auth.config.ts durante la Fase 1/2.
        // Quitar una vez estabilizado el proveedor activo.
        jwksRotateOnTokenGenerationError: true,
        jwt: {
          // Se emite el claim estándar `email_verified` (snake_case). Ojo: con
          // un provider `customJwt` Convex NO lo traduce a
          // `identity.emailVerified` — llega como `identity.email_verified`,
          // que es lo que lee el gate de convex/users.ts::ensureExists. Se
          // define el payload explícito con solo los campos que el resto del
          // backend efectivamente lee de `ctx.auth.getUserIdentity()`.
          definePayload: async ({ user }) => ({
            email: user.email,
            email_verified: user.emailVerified,
            name: user.name,
            picture: user.image,
          }),
        },
      }),
    ],
  });
