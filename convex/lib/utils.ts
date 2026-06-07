import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/** Retorna "YYYY-MM" para un timestamp. Usado en mutations de Convex. */
export function toMonthString(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** Genera un UUID v4 para transferGroupId. Disponible en el runtime de Convex. */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Lanza si `month` no tiene formato "YYYY-MM" válido.
 * Los validadores de Convex no soportan regex, por lo que esta verificación
 * debe hacerse a nivel de handler para proteger los índices by_user_month.
 */
export function assertValidMonth(month: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error(`Formato de mes inválido: "${month}" (esperado: YYYY-MM)`);
  }
}

// Nombres canónicos de las categorías de sistema — usados para lookup por nombre.
export const SYSTEM_CATEGORY_PAYMENT_NAME   = "Pago de tarjeta";
export const SYSTEM_CATEGORY_INTERESTS_NAME = "Gastos financieros";

/** Resuelve el ID de la categoría sistema "Pago de tarjeta" para el usuario dado. */
export async function getSystemPaymentCategoryId(
  ctx: MutationCtx | QueryCtx,
  userId: string
): Promise<Id<"categories"> | undefined> {
  const cat = await ctx.db
    .query("categories")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .filter((q) =>
      q.and(q.eq(q.field("isSystem"), true), q.eq(q.field("name"), SYSTEM_CATEGORY_PAYMENT_NAME))
    )
    .first();
  return cat?._id;
}

/** Resuelve el ID de la categoría sistema "Gastos financieros" para el usuario dado. */
export async function getSystemInterestsCategoryId(
  ctx: MutationCtx | QueryCtx,
  userId: string
): Promise<Id<"categories"> | undefined> {
  const cat = await ctx.db
    .query("categories")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .filter((q) =>
      q.and(q.eq(q.field("isSystem"), true), q.eq(q.field("name"), SYSTEM_CATEGORY_INTERESTS_NAME))
    )
    .first();
  return cat?._id;
}
