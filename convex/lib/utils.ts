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

/** Resuelve el ID de la categoría sistema "Pago de tarjeta" para el usuario dado. */
export async function getSystemPaymentCategoryId(
  ctx: MutationCtx | QueryCtx,
  userId: string
): Promise<Id<"categories"> | undefined> {
  const cat = await ctx.db
    .query("categories")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .filter((q) => q.eq(q.field("isSystem"), true))
    .first();
  return cat?._id;
}
