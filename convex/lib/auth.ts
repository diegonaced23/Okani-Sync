import type { MutationCtx, QueryCtx, ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";

// ─── Helpers de autenticación para funciones Convex ───────────────────────────
//
// Todos los handlers deben llamar a getCurrentUser() o getCurrentUserId()
// antes de acceder a datos del usuario. Esto centraliza:
//   - Validar que el token JWT (Clerk o Better Auth) es válido
//   - Verificar que el usuario existe en nuestra BD
//   - Verificar que el usuario está activo
//
// MIGRACIÓN EN CURSO (docs/migracion-better-auth.md): ambos proveedores están
// registrados en convex/auth.config.ts durante las Fases 1-3, así que
// `identity.subject` puede venir de Clerk (clerkId, caso normal hoy en
// producción) o de Better Auth (authId, solo en pruebas). Todo el resto del
// código de la app sigue usando el `clerkId` histórico como identificador de
// usuario — nunca el id crudo de Better Auth — para no tocar las ~20 tablas
// de negocio que ya lo usan como foreign key. En la Fase 4 (corte) se quita
// la rama de Clerk y esta función vuelve a resolver un solo camino.

/**
 * Resuelve la fila de `users` para la identidad autenticada, probando primero
 * `by_clerkId` (camino Clerk) y luego `by_authId` (camino Better Auth). Sin
 * chequeo de `active` ni de existencia — es solo resolución de identidad, la
 * usan tanto `getCurrentUser` (que sí valida) como lugares que necesitan
 * degradar a `null`/`[]` en vez de lanzar (p. ej. `getMe`, `listAll`).
 */
export async function getCurrentUserOrNull(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  return (
    (await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique()) ??
    (await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.subject))
      .unique())
  );
}

/** Retorna el usuario completo autenticado. Lanza error si no existe o está inactivo. */
export async function getCurrentUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("No autenticado");

  const user = await getCurrentUserOrNull(ctx);

  if (!user) throw new Error("Usuario no encontrado en la base de datos");
  if (!user.active) throw new Error("Tu cuenta está desactivada");

  return user;
}

/**
 * Resuelve el usuario autenticado desde una action (que no tiene `ctx.db`,
 * guideline del proyecto) probando `by_clerkId` y `by_authId` vía una
 * internalQuery. Reemplaza el patrón repetido de `identity.subject` crudo que
 * había en convex/actions/adminUsers.ts y deleteUserCascade.ts — bajo Better
 * Auth ese valor es el authId, no el clerkId que espera `getByClerkIdInternal`.
 */
export async function getCurrentUserFromAction(ctx: ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("No autenticado");

  const user = await ctx.runQuery(internal.users.getByIdentitySubjectInternal, {
    subject: identity.subject,
  });

  if (!user) throw new Error("Usuario no encontrado en la base de datos");
  if (!user.active) throw new Error("Tu cuenta está desactivada");

  return user;
}

/** Retorna solo el clerkId del usuario autenticado (el identificador que usan las tablas de negocio). Más eficiente cuando no se necesita el documento completo. */
export async function getCurrentUserId(
  ctx: QueryCtx | MutationCtx | ActionCtx
): Promise<string> {
  // Mismo orden de resolución en los tres tipos de ctx (clerkId primero,
  // luego authId) — antes esta función tenía una precedencia distinta a la de
  // getCurrentUser para la misma pregunta, lo cual es exactamente el tipo de
  // inconsistencia que genera bugs difíciles de rastrear más adelante.
  if ("db" in ctx) {
    return (await getCurrentUser(ctx)).clerkId;
  }
  return (await getCurrentUserFromAction(ctx)).clerkId;
}

/** Verifica que el usuario autenticado tiene rol admin. Lanza error si no. */
export async function assertAdmin(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentUser(ctx);
  if (user.role !== "admin") {
    throw new Error("Acceso denegado: se requiere rol de administrador");
  }
  return user;
}

/** Igual que assertAdmin, pero para actions (sin ctx.db). */
export async function assertAdminFromAction(ctx: ActionCtx) {
  const user = await getCurrentUserFromAction(ctx);
  if (user.role !== "admin") {
    throw new Error("Acceso denegado: se requiere rol de administrador");
  }
  return user;
}
