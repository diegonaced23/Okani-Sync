import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Webhook } from "svix";

const http = httpRouter();

// ─── Webhook Clerk → Convex ───────────────────────────────────────────────────

http.route({
  path: "/api/webhooks/clerk",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return new Response("Webhook secret no configurado", { status: 500 });
    }

    const svixId = request.headers.get("svix-id");
    const svixTs = request.headers.get("svix-timestamp");
    const svixSig = request.headers.get("svix-signature");

    if (!svixId || !svixTs || !svixSig) {
      return new Response("Faltan headers de Svix", { status: 400 });
    }

    const body = await request.text();
    const wh = new Webhook(webhookSecret);

    let evt: {
      type: string;
      data: {
        id: string;
        email_addresses: Array<{ email_address: string }>;
        first_name: string;
        last_name: string;
        image_url: string;
        public_metadata?: { role?: "user" | "admin" };
      };
    };

    try {
      evt = wh.verify(body, {
        "svix-id": svixId,
        "svix-timestamp": svixTs,
        "svix-signature": svixSig,
      }) as typeof evt;
    } catch {
      return new Response("Firma de webhook inválida", { status: 400 });
    }

    const { type, data } = evt;
    const clerkId = data.id;
    const email = data.email_addresses?.[0]?.email_address ?? "";
    const name = `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim();
    const imageUrl = data.image_url;
    const role = data.public_metadata?.role;

    if (type === "user.created" || type === "user.updated") {
      await ctx.runMutation(internal.users.upsertFromClerk, {
        clerkId,
        email,
        name,
        imageUrl,
        role,
      });
    }

    if (type === "user.deleted") {
      await ctx.runAction(internal.actions.deleteUserCascade.run, {
        clerkId,
        deletedBy: clerkId,
      });
    }

    return new Response(null, { status: 200 });
  }),
});

export default http;
