import { action, internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { assertAdmin, assertAdminFromAction } from "./lib/auth";
import { sendAccessMagicLink } from "./lib/accessLink";
import { normalizeEmail } from "../src/lib/email";
import {
  canReview,
  validateRegistrationRequest,
} from "../src/lib/registrationRequest";
import {
  AUDIT_ACTIONS,
  REGISTRATION_REQUESTS_PER_HOUR,
} from "../src/lib/constants";

const UNA_HORA_MS = 60 * 60 * 1000;

/**
 * Formulario público de solicitud de acceso. ES EL ÚNICO ENDPOINT DE LA APP
 * SIN SESIÓN: no llama getCurrentUser y cualquiera en internet puede invocarlo.
 * Por eso toda la validación va acá y no se confía en nada del navegador.
 *
 * Devuelve SIEMPRE lo mismo —éxito— haya sido una solicitud nueva, una
 * repetida, o una hecha con el correo de alguien que ya tiene cuenta. Si la
 * respuesta cambiara según el caso, el formulario se convertiría en un oráculo
 * para averiguar quién tiene cuenta en la app.
 */
export const submit = mutation({
  args: {
    email: v.string(),
    name: v.string(),
    city: v.string(),
    source: v.string(),
    referredBy: v.optional(v.string()),
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const validation = validateRegistrationRequest(args);
    if (!validation.ok) throw new Error(validation.error);
    const fields = validation.value;

    // Tope global por ventana. `assertRateLimit` de lib/rateLimit.ts NO sirve
    // acá: cuenta filas de `transactions` por usuario, y en este flujo no hay
    // usuario. Se cuenta sobre esta misma tabla.
    const cutoff = Date.now() - UNA_HORA_MS;
    const recientes = await ctx.db
      .query("registrationRequests")
      .withIndex("by_createdAt", (q) => q.gt("createdAt", cutoff))
      .take(REGISTRATION_REQUESTS_PER_HOUR + 1);
    if (recientes.length >= REGISTRATION_REQUESTS_PER_HOUR) {
      throw new Error(
        "Estamos recibiendo muchas solicitudes. Inténtalo de nuevo en un rato."
      );
    }

    // Una pendiente por correo. Se sale SIN insertar y SIN programar correos:
    // lo segundo importa tanto como lo primero, porque si no, pulsar "enviar"
    // diez veces bombardea el buzón del solicitante y el de todos los admins.
    const yaPendiente = await ctx.db
      .query("registrationRequests")
      .withIndex("by_email", (q) => q.eq("email", fields.email))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();
    if (yaPendiente) return null;

    await ctx.db.insert("registrationRequests", {
      ...fields,
      status: "pending",
      createdAt: Date.now(),
    });

    // Se programan DESPUÉS del insert y solo en este camino: la salida
    // temprana de "ya hay una pendiente" no llega hasta acá, que es lo que
    // impide que reenviar el formulario bombardee buzones.
    await ctx.scheduler.runAfter(0, internal.actions.sendRegistrationEmails.sendReceived, {
      email: fields.email,
      name: fields.name,
    });
    await ctx.scheduler.runAfter(0, internal.actions.sendRegistrationEmails.notifyAdmins, {
      name: fields.name,
      email: fields.email,
      city: fields.city,
      source: fields.source,
      referredBy: fields.referredBy,
      note: fields.note,
    });
    return null;
  },
});

/**
 * Solicitudes pendientes para el panel admin.
 *
 * `alreadyRegistered` se resuelve acá y no en el cliente porque la tarjeta no
 * tiene —ni debe tener— la lista de correos de todos los usuarios. Sirve para
 * que el admin no apruebe por inercia una solicitud hecha con el correo de
 * alguien que ya tiene cuenta; el rechazo duro está en `approve`.
 */
export const listPending = query({
  args: {},
  handler: async (ctx) => {
    await assertAdmin(ctx);
    const pending = await ctx.db
      .query("registrationRequests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    return Promise.all(
      pending.map(async (r) => {
        const existente = await ctx.db
          .query("users")
          .withIndex("by_email", (q) => q.eq("email", r.email))
          .first();
        return {
          id: r._id,
          email: r.email,
          name: r.name,
          city: r.city,
          source: r.source,
          referredBy: r.referredBy,
          note: r.note,
          createdAt: r.createdAt,
          alreadyRegistered: existente !== null,
        };
      })
    );
  },
});

/**
 * Rechazo SILENCIOSO: no se envía ningún correo al solicitante, por decisión
 * de producto. La fila no se borra — es el registro de que la decisión se tomó
 * y de quién la tomó.
 */
export const reject = mutation({
  args: { requestId: v.id("registrationRequests") },
  handler: async (ctx, { requestId }) => {
    const admin = await assertAdmin(ctx);
    const request = await ctx.db.get(requestId);
    if (!request) throw new Error("Esa solicitud ya no existe");
    if (!canReview(request.status)) {
      throw new Error("Esa solicitud ya se revisó");
    }

    const now = Date.now();
    await ctx.db.patch(requestId, {
      status: "rejected",
      reviewedAt: now,
      reviewedBy: admin.clerkId,
    });

    // Insert directo, mismo patrón que invitations.revoke: esta es una mutation
    // pública con el contexto de admin ya resuelto, e internal.users.logAuditAction
    // es una internalMutation.
    await ctx.db.insert("auditLogs", {
      userId: admin.clerkId,
      action: AUDIT_ACTIONS.REGISTRATION_REJECTED,
      entity: "registrationRequests",
      entityId: requestId,
      metadata: { email: request.email },
      createdAt: now,
    });
  },
});

/**
 * Primer paso de la aprobación, y el único que decide: en UNA transacción
 * comprueba que la solicitud siga pendiente y que el correo no tenga cuenta,
 * emite la invitación y marca la solicitud como aprobada.
 *
 * Todo junto y ANTES de enviar nada, a propósito. Si la invitación se emitiera
 * en un paso y la solicitud se marcara en otro, un «Rechazar» pulsado mientras
 * la action manda los correos dejaría una solicitud rechazada con una
 * invitación viva y el enlace ya en el buzón: la persona entraría igual. Así,
 * en cuanto esto confirma, un rechazo concurrente falla con «ya se revisó».
 *
 * Devuelve si la invitación la creó esta llamada, para que la reversión no
 * borre una que ya existía (por ejemplo, una emitida desde «Invitar usuario»).
 */
export const claimForApproval = internalMutation({
  args: {
    requestId: v.id("registrationRequests"),
    adminClerkId: v.string(),
  },
  handler: async (ctx, { requestId, adminClerkId }) => {
    const request = await ctx.db.get(requestId);
    if (!request) throw new Error("Esa solicitud ya no existe");
    if (!canReview(request.status)) {
      throw new Error("Esa solicitud ya se revisó");
    }

    // EL CHEQUEO DE SEGURIDAD. El trigger onCreate de convex/auth.ts vincula
    // por email cualquier usuario nuevo de Better Auth que llegue con
    // emailVerified true, que es justo lo que crea un magic link. Aprobar una
    // solicitud hecha con el correo de un usuario existente reabriría esa
    // cuenta por un camino que el admin no eligió —por ejemplo, la de alguien
    // desactivado— y podría dejar dos filas de `users` con el mismo correo.
    //
    // Depende de que `users.email` esté normalizado: por eso existe
    // migrations:normalizeUserEmails.
    const email = normalizeEmail(request.email);
    const existente = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (existente) {
      throw new Error(
        "Ese correo ya tiene una cuenta en la app. No se puede aprobar esta solicitud."
      );
    }

    // Emitir la invitación: el gate real de acceso. Siempre rol "user"; para
    // crear un admin está «Invitar usuario» en el panel. Misma idempotencia que
    // invitations.createFromAdmin: si ya hay una pendiente, se reutiliza.
    const now = Date.now();
    const pendiente = await ctx.db
      .query("invitations")
      .withIndex("by_email", (q) => q.eq("email", email))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();
    const invitationId =
      pendiente?._id ??
      (await ctx.db.insert("invitations", {
        email,
        role: "user",
        status: "pending",
        invitedBy: adminClerkId,
        createdAt: now,
      }));

    await ctx.db.patch(requestId, {
      status: "approved",
      reviewedAt: now,
      reviewedBy: adminClerkId,
    });

    return {
      email,
      name: request.name,
      invitationId,
      createdInvitation: pendiente === null,
    };
  },
});

/**
 * Deshace claimForApproval cuando el envío falló: la solicitud vuelve a
 * pendiente —el botón se puede volver a pulsar— y la invitación que creó esa
 * llamada se borra, para que no quede un acceso vivo de una solicitud que
 * nadie aprobó con éxito. Solo se borra si sigue `pending`: si la persona ya
 * entró con el enlace, su alta es real y la invitación es su registro.
 */
export const revertApproval = internalMutation({
  args: {
    requestId: v.id("registrationRequests"),
    invitationId: v.id("invitations"),
    deleteInvitation: v.boolean(),
  },
  handler: async (ctx, { requestId, invitationId, deleteInvitation }) => {
    const request = await ctx.db.get(requestId);
    if (request?.status === "approved") {
      await ctx.db.patch(requestId, {
        status: "pending",
        reviewedAt: undefined,
        reviewedBy: undefined,
      });
    }
    if (deleteInvitation) {
      const invitation = await ctx.db.get(invitationId);
      if (invitation?.status === "pending") await ctx.db.delete(invitationId);
    }
  },
});

/**
 * Auditoría de la aprobación. Va aparte y al final, solo cuando los envíos
 * salieron: una aprobación revertida no debe quedar en el log como hecha.
 */
export const logApproval = internalMutation({
  args: {
    requestId: v.id("registrationRequests"),
    adminClerkId: v.string(),
    email: v.string(),
  },
  handler: async (ctx, { requestId, adminClerkId, email }) => {
    await ctx.db.insert("auditLogs", {
      userId: adminClerkId,
      action: AUDIT_ACTIONS.REGISTRATION_APPROVED,
      entity: "registrationRequests",
      entityId: requestId,
      metadata: { email },
      createdAt: Date.now(),
    });
  },
});

/**
 * Aprueba una solicitud: emite la invitación y manda el acceso.
 *
 * NO crea el usuario. Aprobar = insertar una fila en `invitations`, que es el
 * gate que lee users.ensureExists. La fila de `users` la crea esa función
 * cuando la persona hace clic en el magic link.
 *
 * La decisión se toma de forma atómica ANTES de enviar nada
 * (claimForApproval). Si un envío falla, se revierte: la solicitud vuelve a
 * pendiente y el botón se puede volver a pulsar sin duplicar nada.
 */
export const approve = action({
  args: { requestId: v.id("registrationRequests") },
  handler: async (ctx, { requestId }) => {
    const admin = await assertAdminFromAction(ctx);

    const claim = await ctx.runMutation(internal.registrationRequests.claimForApproval, {
      requestId,
      adminClerkId: admin.clerkId,
    });

    try {
      // Los dos LANZAN si no pudieron enviar (sendMagicLinkEmail y
      // sendApproved), y eso lleva a la reversión.
      await sendAccessMagicLink(ctx, claim.email);
      await ctx.runAction(internal.actions.sendRegistrationEmails.sendApproved, {
        email: claim.email,
        name: claim.name,
      });
    } catch (err) {
      await ctx.runMutation(internal.registrationRequests.revertApproval, {
        requestId,
        invitationId: claim.invitationId,
        deleteInvitation: claim.createdInvitation,
      });
      throw err;
    }

    await ctx.runMutation(internal.registrationRequests.logApproval, {
      requestId,
      adminClerkId: admin.clerkId,
      email: claim.email,
    });
  },
});
