/**
 * Inventario único de las tablas que guardan datos propios de un usuario.
 *
 * Existe porque había dos sitios que necesitaban esta lista y cada uno tenía la
 * suya: `convex/exportData.ts` (15 tablas) y el borrado en cascada de
 * `convex/actions/deleteUserCascade.ts` (12). Las cuatro que faltaban —`goals`,
 * `loans`, `loanRepayments`, `netWorthSnapshots`— quedaban huérfanas al borrar
 * un usuario desde el panel admin. Con la lista en un solo sitio, añadir una
 * tabla de datos al esquema y olvidarse de una de las dos operaciones deja de
 * ser posible: el `switch` de abajo es exhaustivo y no compila si falta un caso,
 * y hay un test que compara esta lista contra lo que lee la exportación.
 *
 * NO incluye `notifications`, `pushSubscriptions` ni `userStats`: son datos
 * que genera la app, no del usuario, y la exportación tampoco los entrega.
 * Quien los borre debe hacerlo aparte — los tres salen de
 * `factoryReset.ts::deleteGeneratedData`, que llaman tanto el reset como la
 * cascada, así que ninguno de los dos caminos puede olvidarse de uno sin
 * olvidarse de todos.
 */

import type { Id, TableNames } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/**
 * Orden de borrado: las hijas antes que las padres. Convex no impone
 * integridad referencial, pero si el proceso se interrumpe a la mitad es mejor
 * que lo que quede sean padres sin hijas que hijas apuntando a la nada.
 *
 * `transactions` va después de `debtPayments` y `loanRepayments` porque esos
 * abonos enlazan una transacción, y antes de `accounts` y `categories`, a las
 * que sí apunta.
 */
export const USER_DATA_TABLES = [
  "cardInstallments",
  "cardPurchases",
  "cards",
  "debtPayments",
  "debts",
  "loanRepayments",
  "loans",
  "recurringTransactions",
  "transactions",
  "budgets",
  "goals",
  "netWorthSnapshots",
  "categories",
  "accountShares",
  "accounts",
] as const;

export type UserDataTable = (typeof USER_DATA_TABLES)[number];

/**
 * Devuelve hasta `limit` documentos de `table` que pertenecen a `userId`.
 *
 * Siempre por índice. La versión anterior de esta lógica usaba `.filter()`, que
 * en Convex no es un índice: escanea la tabla entera de TODOS los usuarios. En
 * `transactions` eso escala con el tamaño del despliegue, no con el del usuario.
 *
 * Varias tablas no tienen un `by_user` a secas, pero sí un índice compuesto que
 * empieza por el usuario (`by_user_month`), y un `eq` sobre el primer campo de
 * un índice compuesto es una consulta indexada válida. Cuál tiene cuál lo dicta
 * el esquema, no la intuición: `debtPayments` y `loanRepayments` parecen tener
 * `by_user` y no lo tienen.
 */
export async function collectUserDocs(
  ctx: QueryCtx,
  table: UserDataTable,
  userId: string,
  limit: number,
): Promise<Id<TableNames>[]> {
  switch (table) {
    case "cardInstallments":
      return ids(await ctx.db.query("cardInstallments")
        .withIndex("by_user_month", (q) => q.eq("userId", userId)).take(limit));
    case "cardPurchases":
      return ids(await ctx.db.query("cardPurchases")
        .withIndex("by_user", (q) => q.eq("userId", userId)).take(limit));
    case "cards":
      return ids(await ctx.db.query("cards")
        .withIndex("by_user", (q) => q.eq("userId", userId)).take(limit));
    case "debtPayments":
      return ids(await ctx.db.query("debtPayments")
        .withIndex("by_user_month", (q) => q.eq("userId", userId)).take(limit));
    case "debts":
      return ids(await ctx.db.query("debts")
        .withIndex("by_user", (q) => q.eq("userId", userId)).take(limit));
    case "loanRepayments":
      return ids(await ctx.db.query("loanRepayments")
        .withIndex("by_user_month", (q) => q.eq("userId", userId)).take(limit));
    case "loans":
      return ids(await ctx.db.query("loans")
        .withIndex("by_user", (q) => q.eq("userId", userId)).take(limit));
    case "recurringTransactions":
      return ids(await ctx.db.query("recurringTransactions")
        .withIndex("by_user", (q) => q.eq("userId", userId)).take(limit));
    case "transactions":
      return ids(await ctx.db.query("transactions")
        .withIndex("by_user", (q) => q.eq("userId", userId)).take(limit));
    case "budgets":
      return ids(await ctx.db.query("budgets")
        .withIndex("by_user_month", (q) => q.eq("userId", userId)).take(limit));
    case "goals":
      return ids(await ctx.db.query("goals")
        .withIndex("by_user", (q) => q.eq("userId", userId)).take(limit));
    case "netWorthSnapshots":
      return ids(await ctx.db.query("netWorthSnapshots")
        .withIndex("by_user_month", (q) => q.eq("userId", userId)).take(limit));
    case "categories":
      return ids(await ctx.db.query("categories")
        .withIndex("by_user", (q) => q.eq("userId", userId)).take(limit));

    // Las dos direcciones del compartir: las que el usuario cedió y las que le
    // cedieron. Si solo se borrara `by_owner`, al usuario le seguirían
    // apareciendo cuentas ajenas después de un reset.
    case "accountShares": {
      const own = await ctx.db.query("accountShares")
        .withIndex("by_owner", (q) => q.eq("ownerId", userId)).take(limit);
      if (own.length >= limit) return ids(own);
      const guest = await ctx.db.query("accountShares")
        .withIndex("by_shared_user", (q) => q.eq("sharedWithUserId", userId))
        .take(limit - own.length);
      return [...ids(own), ...ids(guest)];
    }

    case "accounts":
      return ids(await ctx.db.query("accounts")
        .withIndex("by_owner", (q) => q.eq("ownerId", userId)).take(limit));

    default: {
      // Si alguien añade una tabla a USER_DATA_TABLES y no la maneja aquí,
      // esta línea deja de compilar. Ese es todo el punto del módulo.
      const unhandled: never = table;
      throw new Error(`Tabla sin manejar en collectUserDocs: ${String(unhandled)}`);
    }
  }
}

function ids<T extends { _id: Id<TableNames> }>(docs: T[]): Id<TableNames>[] {
  return docs.map((d) => d._id);
}

/**
 * Cuántos documentos de `table` tiene `userId`, con tope.
 *
 * Reutiliza `collectUserDocs` para que el conteo y el borrado miren exactamente
 * las mismas filas por los mismos índices: si divergieran, el panel diría un
 * número y el reset de fábrica borraría otro.
 */
export async function countUserDocs(
  ctx: QueryCtx,
  table: UserDataTable,
  userId: string,
  cap: number,
): Promise<number> {
  return (await collectUserDocs(ctx, table, userId, cap)).length;
}
