/**
 * Estado inicial de un usuario: lo que tiene una cuenta recién creada.
 *
 * Estaba duplicado literalmente en `users.ts`, en `ensureExists` y en
 * `createFromAdmin`. El restablecimiento de fábrica necesitaba exactamente lo
 * mismo, y una tercera copia habría garantizado que las tres se desincronizaran.
 * Con un solo sitio, "de fábrica" significa de verdad "como recién creada".
 *
 * Ojo con las categorías del sistema: `categories.ts` prohíbe editarlas,
 * archivarlas y borrarlas, y las transferencias dependen de que existan. Un
 * reset que borrara todas las categorías y repusiera solo las de `DEFAULT_`
 * dejaría la app rota sin avisar.
 */

import { DEFAULT_CATEGORIES } from "../../src/lib/constants";
import type { MutationCtx } from "../_generated/server";

/** Valores del perfil con los que nace una cuenta. */
export const FACTORY_PROFILE = {
  locale: "es-CO",
  currency: "COP",
  theme: "dark" as const,
};

/**
 * Inserta la cuenta por defecto y el juego completo de categorías.
 *
 * Asume que el usuario no tiene ninguna de las dos cosas: solo se llama al
 * crear la fila de `users` o después de haber vaciado sus datos.
 */
export async function seedInitialUserData(
  ctx: MutationCtx,
  userId: string,
  now: number,
): Promise<void> {
  await ctx.db.insert("accounts", {
    ownerId: userId,
    name: "Billetera",
    type: "billetera",
    balance: 0,
    initialBalance: 0,
    currency: FACTORY_PROFILE.currency,
    color: "#4ADE80",
    icon: "wallet",
    isDefault: true,
    isShared: false,
    archived: false,
    createdAt: now,
    updatedAt: now,
  });

  for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
    const cat = DEFAULT_CATEGORIES[i];
    await ctx.db.insert("categories", {
      userId,
      name: cat.name,
      type: cat.type,
      color: cat.color,
      icon: cat.icon,
      isDefault: true,
      archived: false,
      order: i,
      createdAt: now,
      updatedAt: now,
    });
  }
}
