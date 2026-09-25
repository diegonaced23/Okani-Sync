"use node";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { sendAccessMagicLink } from "../lib/accessLink";

/**
 * Fase 4 del corte a Better Auth (docs/migracion-better-auth.md): le manda a
 * cada usuario activo un magic link para que defina su acceso nuevo. Solo se
 * corre una vez, contra producción, en el momento del corte real — nunca
 * contra dev con datos reales.
 *
 * Reanudable: salta a quien ya tenga `authMigrationEmailSentAt` (por si el
 * lote falla a la mitad y hay que volver a correrlo). Un fallo puntual no
 * detiene el resto del lote.
 *
 * Uso:
 *   npx convex run actions/sendMigrationMagicLinks:run
 */
export const run = internalAction({
  args: {},
  handler: async (
    ctx
  ): Promise<{
    total: number;
    sent: number;
    failed: Array<{ clerkId: string; email: string; error: string }>;
  }> => {
    const pending = await ctx.runQuery(
      internal.users.listActiveWithoutMigrationEmailInternal,
      {}
    );

    const failed: Array<{ clerkId: string; email: string; error: string }> = [];
    let sent = 0;

    for (const user of pending) {
      try {
        await sendAccessMagicLink(ctx, user.email);
        await ctx.runMutation(internal.users.markMigrationEmailSent, {
          clerkId: user.clerkId,
        });
        sent++;
      } catch (err) {
        failed.push({
          clerkId: user.clerkId,
          email: user.email,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    console.log(
      `sendMigrationMagicLinks: ${sent}/${pending.length} enviados, ${failed.length} fallidos.`
    );
    return { total: pending.length, sent, failed };
  },
});
