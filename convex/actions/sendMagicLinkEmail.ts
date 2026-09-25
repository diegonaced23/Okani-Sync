"use node";
import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { Resend } from "resend";
import { magicLinkEmailHtml } from "../lib/emailTemplates";

export const run = internalAction({
  args: { email: v.string(), url: v.string() },
  handler: async (ctx, { email, url }) => {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail =
      process.env.RESEND_FROM_EMAIL ?? "Okany Sync <onboarding@resend.dev>";

    if (!apiKey) {
      console.warn("sendMagicLinkEmail: RESEND_API_KEY no configurada");
      return;
    }

    const resend = new Resend(apiKey);

    try {
      const { error } = await resend.emails.send({
        from: fromEmail,
        to: email,
        subject: "Tu enlace de acceso a Okany Sync",
        html: magicLinkEmailHtml(url),
      });

      if (error) {
        console.error("sendMagicLinkEmail: Resend error →", error);
        throw new Error(`No se pudo enviar el enlace de acceso: ${error.message}`);
      }
    } catch (err) {
      // Se relanza: todos los que llaman (aprobar una solicitud, invitar,
      // reenviar el acceso, el envío masivo de la migración) necesitan saber
      // que el enlace NO salió. Tragárselo dejaba una solicitud "aprobada" o
      // un "acceso enviado" cuyo destinatario nunca recibió nada.
      console.error("sendMagicLinkEmail: error inesperado →", err);
      throw err;
    }
  },
});
