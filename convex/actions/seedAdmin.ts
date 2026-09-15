"use node";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { randomUUID } from "node:crypto";
import { sendAccessMagicLink } from "./adminUsers";

const ADMIN_EMAIL = "diego-naced@hotmail.com";
const ADMIN_NAME = "Admin OkanySync";

/**
 * Crea el usuario administrador inicial si aún no existe y le envía un magic
 * link de acceso. Idempotente: correrlo múltiples veces no genera duplicados
 * (busca por email, ya que sin Clerk no hay un id externo estable que
 * consultar antes del primer login).
 *
 * Uso:
 *   npx convex run actions/seedAdmin:run
 */
export const run = internalAction({
  args: {},
  handler: async (ctx): Promise<{ status: string }> => {
    const existing = await ctx.runQuery(internal.users.getByEmailInternal, {
      email: ADMIN_EMAIL,
    });

    const clerkId = existing?.clerkId ?? randomUUID();

    if (!existing) {
      await ctx.runMutation(internal.users.createFromAdmin, {
        clerkId,
        email: ADMIN_EMAIL,
        name: ADMIN_NAME,
        role: "admin",
        createdBy: "seed",
      });
      console.log(`[seedAdmin] Creado en Convex: ${ADMIN_EMAIL}`);
    } else {
      console.log(`[seedAdmin] Ya existe en Convex: ${ADMIN_EMAIL}`);
    }

    // Asegurar rol admin en caso de que el usuario ya existiera como "user"
    await ctx.runMutation(internal.users.patchAdminRole, { clerkId });

    // El único camino de acceso ahora es el magic link — lo vincula por email
    // al primer login (ver trigger onCreate en convex/auth.ts).
    await sendAccessMagicLink(ctx, ADMIN_EMAIL);

    console.log(`[seedAdmin] Admin listo → ${ADMIN_EMAIL}. Magic link enviado.`);
    return { status: "ok" };
  },
});
