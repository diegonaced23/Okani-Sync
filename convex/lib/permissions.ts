import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { getCurrentUserId } from "./auth";

// ─── Helpers de permisos para cuentas compartidas ─────────────────────────────
//
// Cada función valida que el usuario autenticado tenga el nivel de permiso
// requerido sobre la cuenta. Lanza error si no lo tiene.
// Usar en TODAS las mutations/queries que accedan a accounts/transactions.

async function getPermission(
  ctx: QueryCtx | MutationCtx,
  accountId: Id<"accounts">
): Promise<"owner" | "admin" | "editor" | "viewer" | null> {
  // getCurrentUserId resuelve por by_clerkId y by_authId — nunca usar
  // identity.subject directo acá: bajo Better Auth es el authId, no el
  // clerkId que guardan accounts.ownerId y accountShares.sharedWithUserId.
  const clerkId = await getCurrentUserId(ctx);

  const account = await ctx.db.get(accountId);
  if (!account) throw new Error("Cuenta no encontrada");

  if (account.ownerId === clerkId) return "owner";

  const share = await ctx.db
    .query("accountShares")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .filter((q) =>
      q.and(
        q.eq(q.field("sharedWithUserId"), clerkId),
        q.eq(q.field("status"), "aceptada")
      )
    )
    .unique();

  return share?.permission ?? null;
}

export async function assertCanRead(
  ctx: QueryCtx | MutationCtx,
  accountId: Id<"accounts">
) {
  const perm = await getPermission(ctx, accountId);
  if (!perm) throw new Error("Sin acceso a esta cuenta");
}

export async function assertCanWrite(
  ctx: QueryCtx | MutationCtx,
  accountId: Id<"accounts">
) {
  const perm = await getPermission(ctx, accountId);
  if (!perm || perm === "viewer") {
    throw new Error("Sin permiso para crear transacciones en esta cuenta");
  }
}

export async function assertCanManage(
  ctx: QueryCtx | MutationCtx,
  accountId: Id<"accounts">
) {
  const perm = await getPermission(ctx, accountId);
  if (!perm || perm === "viewer" || perm === "editor") {
    throw new Error("Sin permiso para gestionar esta cuenta");
  }
}

export async function assertIsOwner(
  ctx: QueryCtx | MutationCtx,
  accountId: Id<"accounts">
) {
  const perm = await getPermission(ctx, accountId);
  if (perm !== "owner") {
    throw new Error("Solo el propietario puede realizar esta acción");
  }
}
