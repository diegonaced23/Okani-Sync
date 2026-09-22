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
 * Retorna el rango [inicio, fin) en timestamp (hora local) para un mes "YYYY-MM".
 * Útil para consultar índices sobre campos de fecha ya existentes sin necesitar
 * un campo derivado "month" adicional.
 */
export function monthRange(month: string): { start: number; end: number } {
  const [year, monthNum] = month.split("-").map(Number);
  return {
    start: new Date(year, monthNum - 1, 1).getTime(),
    end: new Date(year, monthNum, 1).getTime(),
  };
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

/**
 * La categoría de sistema «Gastos financieros» del modelo anterior de tarjetas.
 *
 * Solo sirve para revertir o migrar movimientos de antes de la fase 3, cuyo
 * interés se sumó al presupuesto de esa categoría. Lo nuevo usa
 * `cards.interestCategoryId` (ver `ensureInterestCategory`). Después de la
 * migración ya no queda ninguna categoría con `isSystem`, y devuelve undefined.
 */
export async function getLegacyInterestsCategoryId(
  ctx: MutationCtx | QueryCtx,
  userId: string
): Promise<Id<"categories"> | undefined> {
  const cat = await ctx.db
    .query("categories")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .filter((q) => q.and(q.eq(q.field("isSystem"), true), q.eq(q.field("name"), "Gastos financieros")))
    .first();
  return cat?._id;
}
