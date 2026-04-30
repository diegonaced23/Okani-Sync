"use node";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { clerkCreateUser, clerkFindUserByEmail } from "../lib/clerkApi";

const ADMIN_EMAIL = "admin@okanysync.com";
const ADMIN_NAME = "Admin OkanySync";
const ADMIN_PASSWORD = "Okanysync123*";

/**
 * Crea el usuario administrador inicial si aún no existe.
 * Idempotente: correrlo múltiples veces no genera duplicados.
 *
 * Uso:
 *   npx convex run actions/seedAdmin:run
 */
export const run = internalAction({
  args: {},
  handler: async (ctx): Promise<{ status: string; clerkId: string }> => {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) throw new Error("CLERK_SECRET_KEY no configurada");

    // 1. Buscar o crear en Clerk
    let clerkUser = await clerkFindUserByEmail({ email: ADMIN_EMAIL, secretKey });

    if (!clerkUser) {
      const nameParts = ADMIN_NAME.split(" ");
      clerkUser = await clerkCreateUser({
        email: ADMIN_EMAIL,
        firstName: nameParts[0],
        lastName: nameParts.slice(1).join(" "),
        password: ADMIN_PASSWORD,
        secretKey,
      });
      console.log(`[seedAdmin] Creado en Clerk: ${clerkUser.id}`);
    } else {
      console.log(`[seedAdmin] Ya existe en Clerk: ${clerkUser.id}`);
    }

    // 2. Crear en Convex con rol admin (idempotente — no crea duplicado)
    await ctx.runMutation(internal.users.createFromAdmin, {
      clerkId: clerkUser.id,
      email: ADMIN_EMAIL,
      name: ADMIN_NAME,
      role: "admin",
      createdBy: "seed",
    });

    // 3. Asegurar rol admin en caso de que el usuario ya existiera como "user"
    await ctx.runMutation(internal.users.patchAdminRole, {
      clerkId: clerkUser.id,
    });

    console.log(`[seedAdmin] Admin listo → ${ADMIN_EMAIL} (${clerkUser.id})`);
    return { status: "ok", clerkId: clerkUser.id };
  },
});
