import type { MutationCtx, QueryCtx, ActionCtx } from "../_generated/server";

// ─── Helpers de autenticación para funciones Convex ───────────────────────────
//
// Todos los handlers deben llamar a getCurrentUser() o getCurrentUserId()
// antes de acceder a datos del usuario. Esto centraliza:
//   - Validar que el token JWT de Clerk es válido
//   - Verificar que el usuario existe en nuestra BD
//   - Verificar que el usuario está activo

/** Retorna el usuario completo autenticado. Lanza error si no existe o está inactivo. */
export async function getCurrentUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("No autenticado");

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();

  if (!user) throw new Error("Usuario no encontrado en la base de datos");
  if (!user.active) throw new Error("Tu cuenta está desactivada");

  return user;
}

/** Retorna solo el clerkId del usuario autenticado. Más eficiente cuando no se necesita el documento completo. */
export async function getCurrentUserId(
  ctx: QueryCtx | MutationCtx | ActionCtx
): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("No autenticado");
  return identity.subject;
}

/** Verifica que el usuario autenticado tiene rol admin. Lanza error si no. */
export async function assertAdmin(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentUser(ctx);
  if (user.role !== "admin") {
    throw new Error("Acceso denegado: se requiere rol de administrador");
  }
  return user;
}
