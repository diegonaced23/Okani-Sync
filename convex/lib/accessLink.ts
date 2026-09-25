import { createAuth } from "../auth";

/**
 * Envía un magic link de acceso al email dado. Mismo mecanismo que usa
 * cualquier login normal (auth.api.signInMagicLink) — llamado server-side, sin
 * un Request real, así que el chequeo de origen/CSRF de Better Auth (que solo
 * corre cuando hay ctx.request) no aplica; ver originCheckMiddleware.
 *
 * Vive en `lib/` y NO en `actions/adminUsers.ts` porque ese archivo lleva
 * "use node": Convex empaqueta los módulos de Node y los de V8 por separado, y
 * un módulo V8 (convex/registrationRequests.ts) no puede importar de uno de
 * Node. Acá no hace falta la directiva — `convex/http.ts` monta las rutas de
 * Better Auth sin ella.
 */
export async function sendAccessMagicLink(
  ctx: Parameters<typeof createAuth>[0],
  email: string
) {
  await createAuth(ctx).api.signInMagicLink({
    body: { email, callbackURL: "/" },
    headers: new Headers(),
  });
}
