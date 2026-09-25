"use node";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { Resend } from "resend";
import { REGISTRATION_SOURCES } from "../../src/lib/constants";
import {
  newRegistrationRequestEmailHtml,
  registrationApprovedEmailHtml,
  registrationReceivedEmailHtml,
} from "../lib/emailTemplates";

const FROM_FALLBACK = "Okany Sync <onboarding@resend.dev>";

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/** Acuse al solicitante. Informativo: si falla, no rompe nada. */
export const sendReceived = internalAction({
  args: { email: v.string(), name: v.string() },
  handler: async (ctx, { email, name }) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn("sendRegistrationEmails.sendReceived: RESEND_API_KEY no configurada");
      return;
    }
    try {
      const { error } = await new Resend(apiKey).emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? FROM_FALLBACK,
        to: email,
        subject: "Recibimos tu solicitud — Okany Sync",
        html: registrationReceivedEmailHtml(name),
      });
      if (error) console.error("sendReceived: Resend error →", error);
    } catch (err) {
      console.error("sendReceived: error inesperado →", err);
    }
  },
});

/**
 * Aviso a todos los administradores activos.
 *
 * `allSettled` y no `all`: un correo que rebote no puede impedir que los demás
 * admins se enteren. El estado real está en la tabla `registrationRequests`,
 * así que estos correos son un empujón, no la fuente de verdad.
 */
export const notifyAdmins = internalAction({
  args: {
    name: v.string(),
    email: v.string(),
    city: v.string(),
    source: v.string(),
    referredBy: v.optional(v.string()),
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn("sendRegistrationEmails.notifyAdmins: RESEND_API_KEY no configurada");
      return;
    }

    const destinatarios = await ctx.runQuery(internal.users.listAdminEmailsInternal, {});
    if (destinatarios.length === 0) {
      console.warn("notifyAdmins: no hay administradores activos a quien avisar");
      return;
    }

    const sourceLabel =
      REGISTRATION_SOURCES.find((s) => s.value === args.source)?.label ?? args.source;
    // Los campos se enumeran en vez de esparcir `args`: la plantilla recibe
    // `sourceLabel` y NO `source`, y colar un campo de más en un literal de
    // objeto es un error de tipos.
    const html = newRegistrationRequestEmailHtml(
      {
        name: args.name,
        email: args.email,
        city: args.city,
        sourceLabel,
        referredBy: args.referredBy,
        note: args.note,
      },
      `${appUrl()}/admin`
    );

    const resend = new Resend(apiKey);
    const resultados = await Promise.allSettled(
      destinatarios.map((to) =>
        resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL ?? FROM_FALLBACK,
          to,
          subject: "Nueva solicitud de acceso a Okany Sync",
          html,
        })
      )
    );
    for (const r of resultados) {
      if (r.status === "rejected") console.error("notifyAdmins: envío fallido →", r.reason);
    }
  },
});

/**
 * Aprobación. A DIFERENCIA de los otros dos, LANZA si no puede enviar.
 *
 * Quien la llama (registrationRequests.approve) solo marca la solicitud como
 * aprobada si esto no lanzó. Tragarse el fallo dejaría una solicitud
 * "aprobada" cuya persona no se entera nunca, y sin forma de detectarlo.
 */
export const sendApproved = internalAction({
  args: { email: v.string(), name: v.string() },
  handler: async (ctx, { email, name }) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error(
        "No se puede aprobar: falta RESEND_API_KEY, así que el solicitante no recibiría el aviso."
      );
    }
    const { error } = await new Resend(apiKey).emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? FROM_FALLBACK,
      to: email,
      subject: "Tu solicitud fue aprobada 🎉",
      html: registrationApprovedEmailHtml(name, `${appUrl()}/login`),
    });
    if (error) throw new Error(`No se pudo enviar el correo de aprobación: ${error.message}`);
  },
});
