"use node";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { Resend } from "resend";
import { welcomeEmailHtml } from "../lib/emailTemplates";

export const run = internalAction({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }) => {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail =
      process.env.RESEND_FROM_EMAIL ?? "Okany Sync <onboarding@resend.dev>";
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    if (!apiKey) {
      console.warn("sendWelcomeEmail: RESEND_API_KEY no configurada");
      return;
    }

    const user = await ctx.runQuery(internal.users.getByClerkIdInternal, {
      clerkId,
    });
    if (!user) {
      console.warn(`sendWelcomeEmail: usuario ${clerkId} no encontrado`);
      return;
    }

    const resend = new Resend(apiKey);
    const signInUrl = `${appUrl}/sign-in`;

    try {
      const { error } = await resend.emails.send({
        from: fromEmail,
        to: user.email,
        subject: "Bienvenido a Okany Sync 🎉",
        html: welcomeEmailHtml(user.name, signInUrl),
      });

      if (error) {
        console.error("sendWelcomeEmail: Resend error →", error);
        return;
      }

      await ctx.runMutation(internal.users.markWelcomeEmailSent, { clerkId });
      console.log(`sendWelcomeEmail: enviado a ${user.email}`);
    } catch (err) {
      console.error("sendWelcomeEmail: error inesperado →", err);
    }
  },
});
