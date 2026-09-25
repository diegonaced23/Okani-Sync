import { action, internalMutation, internalQuery, query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  AUDIT_ACTIONS,
  MAX_AVATAR_SIZE_BYTES,
  ALLOWED_AVATAR_MIME_TYPES,
  AVATAR_UPLOAD_THROTTLE_MS,
} from "../src/lib/constants";
import { normalizeEmail } from "../src/lib/email";
import { shouldRefreshLastSeen } from "../src/lib/adminHealth";
import {
  getCurrentUser,
  getCurrentUserOrNull,
  getCurrentUserFromAction,
  assertAdmin,
} from "./lib/auth";
import { seedInitialUserData } from "./lib/seedUserData";
import { authComponent, createAuth } from "./auth";
import {
  DEFAULT_NOTIFICATION_PREFS,
  isNotificationAllowed,
  NOTIFICATION_PREF_KEYS,
  type NotificationType,
} from "../src/lib/notifications";
import { assertAuditRateLimit } from "./lib/rateLimit";

// ─── Query pública: usuario autenticado actual ────────────────────────────────

export const getMe = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) return null;
    // La URL de storage es temporal, así que se resuelve en cada lectura y no
    // se persiste. `imageUrl` es el campo heredado de Clerk: se sigue leyendo
    // como respaldo para quien aún tenga foto de antes, pero ya no se escribe.
    const avatarUrl = user.imageStorageId
      ? await ctx.storage.getUrl(user.imageStorageId)
      : (user.imageUrl ?? null);
    return { ...user, avatarUrl };
  },
});

/**
 * Crea el documento de usuario si aún no existe (carrera webhook vs. primer acceso).
 * Llamar desde el cliente inmediatamente después del login.
 *
 * MIGRACIÓN EN CURSO (docs/migracion-better-auth.md): mientras conviven Clerk
 * y Better Auth (Fases 1-3), esta mutation es también el camino de
 * reparación idempotente del vínculo `authId` — el trigger `onCreate` de
 * convex/auth.ts hace el enlace por email en el camino rápido (una sola vez,
 * en el primer login de cada persona bajo Better Auth), pero si esa única
 * ejecución no encontró match (mayúsculas distintas, carrera, etc.) esta
 * mutation vuelve a intentarlo cada vez que se llama, sin duplicar la fila.
 */
export const ensureExists = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("No autenticado");

    // Ya vinculado (sesión de Better Auth de alguien que ya pasó por acá antes).
    const linked = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.subject))
      .unique();
    if (linked) {
      if (!linked.active) throw new Error("No autorizado: usuario desactivado");
      await touchLastSeen(ctx, linked);
      return linked._id;
    }

    // Camino normal hoy: sesión de Clerk, el subject ya es el clerkId.
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (existing) {
      if (!existing.active) throw new Error("No autorizado: usuario desactivado");
      await touchLastSeen(ctx, existing);
      return existing._id;
    }

    // Se usa para el enlace por email de un usuario legacy, para la búsqueda
    // de invitación y para el `users.email` de un alta nueva (ver más abajo).
    const normalizedEmail = normalizeEmail(identity.email ?? "");

    // Primer login de un usuario preexistente bajo Better Auth: vincular por
    // email en vez de crear una fila nueva (repara lo que el trigger no pudo).
    // NOTA: `users.email` se guardó históricamente sin normalizar (tal cual
    // llegaba del webhook de Clerk), así que este match puede fallar si el
    // email quedó con mayúsculas distintas. Antes del corte (Fase 4) conviene
    // verificar que los emails en `users` estén en minúscula.
    const legacy = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .unique();
    // Un `authId` huérfano (su usuario de Better Auth se borró y se volvió a
    // crear con el mismo correo) cuenta como "sin vincular": nadie puede
    // entrar con él, y sin esto la fila queda inaccesible para siempre. Un
    // `authId` que apunta a un usuario vivo nunca se sobrescribe.
    const legacyIsLinkable =
      legacy !== null &&
      (legacy.authId === undefined ||
        (await authComponent.getAnyUserById(ctx, legacy.authId)) === null);
    if (legacy && legacyIsLinkable) {
      // Igual que el trigger onCreate de convex/auth.ts: solo se vincula por
      // email si el proveedor ya verificó la posesión del correo. Sin este
      // gate, un sign-up con el email de otra persona (aunque hoy el signup
      // por password esté bloqueado con disableSignUp, esta es la defensa
      // correcta por si ese flag se relaja en el futuro) podría "robar" el
      // vínculo authId de una cuenta real. Solo aplica a este camino de
      // enlace — nunca a una fila que ya matcheó por clerkId/authId arriba,
      // ni al alta de un usuario genuinamente nuevo (gateada por invitación).
      // El provider de Better Auth es `customJwt`, y Convex entrega sus claims
      // tal cual: llega `email_verified` (snake_case) y `emailVerified` queda
      // undefined. Se aceptan ambos por si el provider cambia a OIDC.
      if (identity.emailVerified !== true && identity.email_verified !== true) {
        throw new Error("No autorizado: verifica tu correo antes de continuar");
      }
      if (!legacy.active) throw new Error("No autorizado: usuario desactivado");
      // `lastSeenAt` en el MISMO patch: esta rama es una entrada real a la
      // app, igual que las dos de arriba. Sin ella, quien se vincula por este
      // camino sale del login marcado como "nunca ha entrado" y, si además no
      // tiene movimientos contados, como cuenta dormida.
      await ctx.db.patch(legacy._id, { authId: identity.subject, lastSeenAt: Date.now() });
      return legacy._id;
    }

    // El webhook aún no llegó — verificar invitación antes de crear
    const email = identity.email ?? "";
    // `normalizedEmail` ya está calculado más arriba en este handler. La
    // invitación se busca con él porque es como se guarda desde
    // invitations.createFromAdmin.
    const invitation = await ctx.db
      .query("invitations")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();

    if (!invitation) throw new Error("No autorizado: usuario no invitado");

    const now = Date.now();
    const name = identity.name ?? (email || "Usuario");

    const userId = await ctx.db.insert("users", {
      // authId se deja sin definir a propósito: para un usuario genuinamente
      // nuevo, clerkId YA es su identity.subject real (sea de Clerk hoy o de
      // Better Auth después del corte), así que el lookup por by_clerkId
      // alcanza sin necesitar el puente. Setearlo acá igual a identity.subject
      // rompería la migración de alguien que se registre entre ahora y el
      // corte bajo Clerk: quedaría con authId "ocupado" por un id de Clerk,
      // el trigger de vinculación lo saltaría pensando que ya está enlazado,
      // y en su primer login real bajo Better Auth terminaría bloqueado con
      // "usuario no invitado" (su invitación ya se consumió acá).
      clerkId: identity.subject,
      // Normalizado, no crudo. Antes se guardaba tal cual "para no alterar el
      // flujo de Clerk que ya está en producción" — Clerk ya no existe.
      // Guardarlo crudo reabre el agujero que tapó
      // migrations:normalizeUserEmails: si el proveedor devolviera el correo
      // con mayúsculas distintas, el chequeo anti-secuestro de
      // registrationRequests.approve (que busca por by_email en minúsculas) no
      // encontraría a este usuario. El trigger onCreate de convex/auth.ts ya
      // asume que esta columna está en minúsculas.
      email: normalizedEmail,
      name,
      imageUrl: identity.pictureUrl,
      role: invitation.role,
      active: true,
      locale: "es-CO",
      currency: "COP",
      theme: "dark",
      createdAt: now,
      updatedAt: now,
      // El alta ocurre DENTRO del primer login, así que la primera visita es
      // ahora. Dejarlo sin definir hacía que un invitado que acaba de entrar
      // apareciera en el panel como «nunca ha entrado» y —con 0 movimientos,
      // que es lo normal el primer día— como «Cuenta dormida»: justo el flujo
      // que vigila la tarjeta de invitaciones.
      lastSeenAt: now,
      // Obliga a definir contraseña antes de usar la app (ver AuthGuard y
      // /definir-password). Se marca a TODO usuario nuevo, no solo a los que
      // llegan por el formulario público: quien entra por magic link no tiene
      // cuenta `credential` en Better Auth, así que sin esto no puede volver a
      // entrar nunca —ni siquiera con «¿olvidaste tu contraseña?», que no le
      // enviaría nada.
      mustSetPassword: true,
    });

    await ctx.db.patch(invitation._id, { status: "accepted", acceptedAt: now });

    await seedInitialUserData(ctx, identity.subject, now);

    return userId;
  },
});

/** Actualiza la moneda preferida del usuario. */
export const updateCurrency = mutation({
  args: { currency: v.string() },
  handler: async (ctx, { currency }) => {
    const user = await getCurrentUser(ctx);
    await ctx.db.patch(user._id, { currency, updatedAt: Date.now() });
  },
});

/**
 * Marca (o quita, con `null`) la cuenta o tarjeta favorita: la que llega
 * seleccionada al registrar un movimiento. Solo se acepta un producto propio y
 * activo; una cuenta compartida contigo no es tuya para elegirla por defecto.
 */
export const setFavoriteSource = mutation({
  args: {
    source: v.union(
      v.object({ kind: v.literal("account"), id: v.id("accounts") }),
      v.object({ kind: v.literal("card"), id: v.id("cards") }),
      v.null()
    ),
  },
  handler: async (ctx, { source }) => {
    const user = await getCurrentUser(ctx);
    if (source?.kind === "account") {
      const account = await ctx.db.get(source.id);
      if (!account || account.ownerId !== user.clerkId || account.archived) {
        throw new Error("Esa cuenta no está disponible");
      }
    } else if (source?.kind === "card") {
      const card = await ctx.db.get(source.id);
      if (!card || card.userId !== user.clerkId || card.archived) {
        throw new Error("Esa tarjeta no está disponible");
      }
    }
    await ctx.db.patch(user._id, { favoriteSource: source ?? undefined, updatedAt: Date.now() });
  },
});

/** Actualiza el tema del usuario. */
export const updateTheme = mutation({
  args: {
    theme: v.union(v.literal("light"), v.literal("dark"), v.literal("system")),
  },
  handler: async (ctx, { theme }) => {
    const user = await getCurrentUser(ctx);
    await ctx.db.patch(user._id, { theme, updatedAt: Date.now() });
  },
});

/** Actualiza el nombre del usuario. La app es la única fuente de verdad para el nombre (no Better Auth). */
/** Espejo de MAX_USER_NAME_LENGTH en src/lib/constants.ts — mantener ambos iguales. */
const MAX_NAME_LENGTH = 60;

export const updateName = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("El nombre no puede estar vacío");
    // Sin tope, una cadena de miles de caracteres se guardaba y rompía la cabecera,
    // la barra lateral y cualquier fila que muestre el nombre.
    if (trimmed.length > MAX_NAME_LENGTH) {
      throw new Error(`El nombre no puede pasar de ${MAX_NAME_LENGTH} caracteres`);
    }
    const user = await getCurrentUser(ctx);
    await ctx.db.patch(user._id, { name: trimmed, updatedAt: Date.now() });
  },
});

/** Actualiza (con merge) las preferencias de notificación del usuario. */
export const updateNotificationPrefs = mutation({
  args: {
    prefs: v.object({
      presupuestos: v.optional(v.boolean()),
      tarjetas: v.optional(v.boolean()),
      deudasPrestamos: v.optional(v.boolean()),
      recurrentes: v.optional(v.boolean()),
      recordatorioDiario: v.optional(v.boolean()),
      resumenes: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, { prefs }) => {
    const user = await getCurrentUser(ctx);
    // El merge parte del default "todo activo" cuando el usuario aún no tiene
    // preferencias: así el objeto guardado siempre está completo y el validador
    // del schema (que exige los seis booleanos) se satisface.
    const merged = { ...DEFAULT_NOTIFICATION_PREFS, ...user.notificationPrefs };
    for (const key of NOTIFICATION_PREF_KEYS) {
      const value = prefs[key];
      if (value !== undefined) merged[key] = value;
    }
    await ctx.db.patch(user._id, {
      notificationPrefs: merged,
      updatedAt: Date.now(),
    });
  },
});

// Acciones que el propio usuario puede registrar en `auditLogs` desde el
// cliente. La whitelist es el control: sin ella, un cliente podría inyectar
// entradas de acciones administrativas en el log de auditoría.
const SELF_AUDIT_ACTIONS: readonly string[] = [
  AUDIT_ACTIONS.USER_PASSWORD_CHANGED,
  AUDIT_ACTIONS.USER_DATA_EXPORTED,
];

/**
 * Registra en `auditLogs` una acción del propio usuario. Existe porque el
 * cambio de contraseña ocurre íntegramente dentro de Better Auth, sin pasar por
 * ninguna función de Convex, y CLAUDE.md exige auditar los cambios sensibles.
 *
 * Nunca acepta `targetUserId` ni metadata: siempre escribe `userId` del
 * llamante y una acción de la whitelist.
 */
export const logSelfAudit = mutation({
  args: { action: v.string() },
  handler: async (ctx, { action }) => {
    const user = await getCurrentUser(ctx);
    if (!SELF_AUDIT_ACTIONS.includes(action)) {
      throw new Error("Acción de auditoría no permitida");
    }
    await assertAuditRateLimit(ctx, user.clerkId, {
      max: 10,
      windowMs: 60_000,
      message: "Demasiadas operaciones seguidas. Intenta de nuevo en un minuto.",
    });
    await ctx.db.insert("auditLogs", {
      userId: user.clerkId,
      action,
      entity: "users",
      entityId: user._id,
      createdAt: Date.now(),
    });
  },
});

/**
 * ¿Debe entregarse una notificación de este tipo a este usuario? La consulta
 * `convex/lib/notify.ts` antes de crear la notificación in-app y el push.
 * `userId` es el clerkId, igual que en el resto de tablas de negocio.
 */
export const isNotificationEnabledInternal = internalQuery({
  args: { userId: v.string(), type: v.string() },
  handler: async (ctx, { userId, type }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
      .unique();
    // Sin fila de usuario no hay preferencias que respetar; se deja pasar para
    // no silenciar notificaciones por un problema de resolución de identidad.
    if (!user) return true;
    return isNotificationAllowed(type as NotificationType, user.notificationPrefs);
  },
});

/**
 * URL de subida para el avatar. Lleva un estrangulador simple por usuario: sin
 * él, un cliente podría pedir URLs en bucle y llenar el storage con archivos
 * que nunca se enlazan a ninguna fila.
 *
 * No se usa `assertRateLimit`: esa función cuenta filas de `transactions`, así
 * que aquí limitaría según cuántos movimientos registró el usuario.
 *
 * Devuelve un resultado discriminado en vez de lanzar cuando el estrangulador
 * bloquea la subida: Convex enmascara en producción el mensaje de un `Error`
 * plano (lo reemplaza por "Server Error" del lado del cliente), así que un
 * `throw` aquí nunca llegaría a la persona. Al viajar como dato en vez de
 * como texto de excepción, el mensaje sobrevive. Mismo motivo por el que
 * `updateAvatar`, más abajo, también retorna en vez de lanzar.
 */
export const generateAvatarUploadUrl = mutation({
  args: {},
  handler: async (ctx): Promise<{ ok: true; url: string } | { ok: false; error: string }> => {
    const user = await getCurrentUser(ctx);
    const now = Date.now();
    if (
      user.lastAvatarUploadAt !== undefined &&
      now - user.lastAvatarUploadAt < AVATAR_UPLOAD_THROTTLE_MS
    ) {
      return { ok: false, error: "Espera unos segundos antes de subir otra foto" };
    }
    await ctx.db.patch(user._id, { lastAvatarUploadAt: now });
    return { ok: true, url: await ctx.storage.generateUploadUrl() };
  },
});

/**
 * Enlaza un archivo ya subido como avatar del usuario.
 *
 * La validación de `contentType` es defensa en profundidad, no garantía: el
 * tipo lo declara el cliente al subir y no se verifica por magic bytes. Es el
 * mismo criterio que convex/transactions.ts aplica a los comprobantes.
 *
 * Devuelve un resultado discriminado en vez de lanzar cuando el archivo no
 * pasa la validación (ver comentario en esa rama). Errores genuinos —no
 * autenticado, etc.— sí siguen lanzando, porque esos no dependen de que el
 * borrado del archivo se confirme junto con la mutation.
 */
export const updateAvatar = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const user = await getCurrentUser(ctx);

    // Paso 1: el archivo debe existir. Si no, no hay nada que borrar — un
    // `storage.delete` sobre un id inexistente lanza, así que este chequeo
    // también evita ese error latente.
    const file = await ctx.db.system.get(storageId);
    if (!file) {
      return { ok: false, error: "El archivo subido ya no existe. Intenta subirlo de nuevo" };
    }

    // Paso 2: el `storageId` lo manda el cliente, así que cualquier id de
    // `_storage` que exista en el deployment —incluido el de OTRO usuario— es
    // técnicamente aceptado por el validador `v.id("_storage")`. Sin este
    // chequeo de vigencia, un llamante podría pasar el `storageId` de un
    // comprobante ajeno (por ejemplo, uno leído vía `listByAccountMonth` en
    // una cuenta compartida donde solo tiene permiso de lectura) y el borrado
    // más abajo se convertiría en una primitiva de destrucción de archivos
    // entre usuarios. Solo se acepta un archivo creado DESPUÉS de que este
    // mismo usuario pidió su propia URL de subida (`generateAvatarUploadUrl`
    // registra ese instante en `lastAvatarUploadAt`).
    if (user.lastAvatarUploadAt === undefined || file._creationTime < user.lastAvatarUploadAt) {
      return { ok: false, error: "El archivo subido no es válido para tu cuenta" };
    }

    const invalid =
      !file.contentType ||
      !ALLOWED_AVATAR_MIME_TYPES.includes(
        file.contentType as (typeof ALLOWED_AVATAR_MIME_TYPES)[number]
      ) ||
      file.size > MAX_AVATAR_SIZE_BYTES;

    if (invalid) {
      // Borrar el archivo rechazado: si no, cada intento fallido deja basura
      // permanente en storage. Se retorna en vez de lanzar: las mutations de
      // Convex son transaccionales, así que un `throw` aquí revertiría este
      // mismo `storage.delete` junto con el resto de la mutation y el archivo
      // rechazado quedaría huérfano de todos modos. No "limpiar" esto a un
      // `throw` más adelante — reintroduciría el huérfano en silencio.
      await ctx.storage.delete(storageId);
      return { ok: false, error: "La foto debe ser JPEG, PNG o WebP y pesar menos de 2 MB" };
    }

    const previous = user.imageStorageId;
    await ctx.db.patch(user._id, { imageStorageId: storageId, updatedAt: Date.now() });
    if (previous) await ctx.storage.delete(previous);
    return { ok: true };
  },
});

/**
 * Quita la foto de perfil y borra el archivo.
 *
 * También limpia `imageUrl` (el campo heredado de Clerk): `getMe` cae en él
 * cuando no hay `imageStorageId`, así que un usuario legacy que solo tiene
 * `imageUrl` vería "Quitar foto" en la UI sin que este `return` temprano
 * hiciera nada. Esta es la única escritura legítima sobre `imageUrl` — el
 * resto del código lo trata como dato legacy de solo lectura — porque es una
 * remoción explícita pedida por el propio usuario.
 */
export const removeAvatar = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user.imageStorageId && !user.imageUrl) return;
    const previous = user.imageStorageId;
    await ctx.db.patch(user._id, {
      imageStorageId: undefined,
      imageUrl: undefined,
      updatedAt: Date.now(),
    });
    if (previous) await ctx.storage.delete(previous);
  },
});

/** Borra el archivo de avatar de un usuario. Usada por la cascada de eliminación. */
export const deleteAvatarFileInternal = internalMutation({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (!user?.imageStorageId) return;
    await ctx.storage.delete(user.imageStorageId);
    await ctx.db.patch(user._id, { imageStorageId: undefined });
  },
});

// ─── Query interna: buscar usuario por clerkId ────────────────────────────────

/**
 * Ficha de un usuario para el panel admin (o la propia, si alguien se consulta
 * a sí mismo).
 *
 * DOS cambios respecto de la versión anterior, ambos por el mismo motivo:
 *
 * 1. `assertAdmin` en vez de `getCurrentUserOrNull` + comprobación de rol en
 *    línea. Ese patrón se eliminó de `listAll`/`adminStats` precisamente
 *    porque `getCurrentUserOrNull` NO valida `active`: un administrador
 *    desactivado seguía leyendo el documento completo de cualquiera. Ahora la
 *    ficha del panel depende de esta query, así que el agujero era real.
 *    Consecuencia deliberada: para un no-admin que consulta a otro, esto ahora
 *    LANZA en vez de devolver `null`. La pantalla que la usa está bajo el
 *    guard de `/admin`, así que ese caso no existe en la interfaz.
 * 2. Proyección explícita. Se dejan fuera `authId` (el puente con Better Auth,
 *    que no pinta nada en la interfaz y es un identificador de sesión),
 *    `notificationPrefs` (preferencia personal, no asunto del admin),
 *    `imageStorageId` y `lastAvatarUploadAt`. Se devuelve exactamente lo que
 *    la ficha muestra.
 */
export const getByClerkId = query({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }) => {
    // Comparar contra caller.clerkId (no identity.subject): bajo Better Auth
    // identity.subject es el authId, no el clerkId, así que compararlo
    // directo haría fallar el check "soy yo mismo" para todo el mundo.
    const caller = await getCurrentUserOrNull(ctx);
    if (!caller) return null;
    if (caller.clerkId !== clerkId) await assertAdmin(ctx);

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (!user) return null;

    return {
      _id: user._id,
      clerkId: user.clerkId,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
      createdAt: user.createdAt,
      lastSeenAt: user.lastSeenAt,
      welcomeEmailSentAt: user.welcomeEmailSentAt,
    };
  },
});

// ─── Queries admin ────────────────────────────────────────────────────────────

/**
 * Lista de usuarios para el panel, con PROYECCIÓN explícita.
 *
 * Se elige campo a campo —nunca el documento entero, que traería `authId`,
 * `notificationPrefs` e `imageStorageId`— y en particular no se incluye ningún
 * importe, saldo ni descripción: la restricción de privacidad del panel es que
 * solo pueden salir conteos y fechas.
 */
export const listForAdmin = query({
  args: {},
  handler: async (ctx) => {
    await assertAdmin(ctx);

    const users = await ctx.db.query("users").order("desc").collect();
    // `userStats` ya trae los conteos materializados por
    // convex/adminStats.ts::recomputeAll — no se recalculan acá, solo se
    // proyectan junto con el resto de la fila de usuario.
    const stats = await ctx.db.query("userStats").collect();
    const byUser = new Map(stats.map((s) => [s.userId, s]));

    return users.map((u) => {
      const s = byUser.get(u.clerkId);
      return {
        clerkId: u.clerkId,
        name: u.name,
        email: u.email,
        role: u.role,
        active: u.active,
        createdAt: u.createdAt,
        // `undefined` para quien nunca haya entrado desde que se desplegó el
        // campo — se pasa tal cual, no se sustituye por `createdAt` ni por 0.
        lastSeenAt: u.lastSeenAt,
        // `undefined` —y NO `?? 0`— cuando no hay fila en `userStats`: nadie
        // ha corrido el recálculo desde que este usuario existe, así que no
        // hay conteo. El 0 por defecto que había aquí hacía que `isDormant`
        // recibiera un cero inventado y el panel afirmara «dormida» y «En
        // uso: 0» a partir de un número que él mismo declaraba no haber
        // calculado (`statsComputedAt: undefined`). La ignorancia se propaga
        // hasta la interfaz, que la dice, en vez de disfrazarse de cero por
        // el camino: ver `activityStatus` en src/lib/adminHealth.ts.
        transactionCount: s?.counts.transactions,
        accountCount: s?.counts.accounts,
        statsComputedAt: s?.computedAt,
        // `userStats.capped` distingue "conteo exacto" de "llegó al tope de
        // STATS_COUNT_CAP en alguna tabla de este usuario". Sin este campo,
        // un conteo topado se pintaría igual que uno exacto.
        statsCapped: s?.capped ?? false,
      };
    });
  },
});

// ─── Mutations admin ─────────────────────────────────────────────────────────

/** Edita nombre, rol o estado activo de un usuario (solo admin). */
export const updateByAdmin = mutation({
  args: {
    targetClerkId: v.string(),
    name: v.optional(v.string()),
    role: v.optional(v.union(v.literal("admin"), v.literal("user"))),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, { targetClerkId, ...fields }) => {
    const caller = await assertAdmin(ctx);

    const target = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", targetClerkId))
      .unique();
    if (!target) throw new Error("Usuario no encontrado");

    // Evitar que el último admin activo quede sin acceso administrativo
    const isDemotion = target.role === "admin" && (fields.role === "user" || fields.active === false);
    if (isDemotion) {
      const activeAdmins = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "admin"))
        .filter((q) => q.eq(q.field("active"), true))
        .collect();
      if (activeAdmins.length <= 1) {
        throw new Error("No se puede remover o desactivar el último administrador activo del sistema");
      }
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (fields.name !== undefined)   patch.name   = fields.name;
    if (fields.role !== undefined)   patch.role   = fields.role;
    if (fields.active !== undefined) patch.active = fields.active;

    await ctx.db.patch(target._id, patch);

    // Audit log
    const action = fields.role !== undefined
      ? AUDIT_ACTIONS.USER_ROLE_CHANGED
      : fields.active === false
        ? AUDIT_ACTIONS.USER_DEACTIVATED
        : AUDIT_ACTIONS.USER_UPDATED;

    await ctx.db.insert("auditLogs", {
      userId: caller.clerkId,
      targetUserId: targetClerkId,
      action,
      entity: "users",
      entityId: target._id,
      metadata: fields,
      createdAt: Date.now(),
    });
  },
});

// ─── Mutations internas (para actions de admin) ───────────────────────────────

export const getByClerkIdInternal = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();
  },
});

/**
 * Busca un usuario por correo. La usa el chequeo de idempotencia de seedAdmin.
 *
 * El correo se normaliza acá, igual que se guarda. `first()` y no `unique()`:
 * si quedaran dos filas con el mismo correo, la respuesta correcta sigue
 * siendo "ya existe", no lanzar.
 */
export const getByEmailInternal = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalizeEmail(email)))
      .first();
  },
});

/**
 * Resuelve un usuario por `identity.subject` probando `by_clerkId` y
 * `by_authId` — usada por convex/lib/auth.ts::getCurrentUserFromAction para
 * que las actions (sin ctx.db) puedan resolver identidad bajo ambos
 * proveedores, igual que getCurrentUserOrNull ya hace para queries/mutations.
 */
export const getByIdentitySubjectInternal = internalQuery({
  args: { subject: v.string() },
  handler: async (ctx, { subject }) => {
    return (
      (await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", subject))
        .unique()) ??
      (await ctx.db
        .query("users")
        .withIndex("by_authId", (q) => q.eq("authId", subject))
        .unique())
    );
  },
});

export const createFromAdmin = internalMutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    role: v.union(v.literal("user"), v.literal("admin")),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();
    if (existing) return existing._id; // Idempotente si el webhook ya actuó

    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      clerkId: args.clerkId,
      email: normalizeEmail(args.email),
      name: args.name,
      role: args.role,
      active: true,
      locale: "es-CO",
      currency: "COP",
      theme: "dark",
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    });

    await seedInitialUserData(ctx, args.clerkId, now);

    return userId;
  },
});

export const markWelcomeEmailSent = internalMutation({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (user) await ctx.db.patch(user._id, { welcomeEmailSentAt: Date.now() });
  },
});

/** Usado solo por sendMigrationMagicLinks (Fase 4, corte a Better Auth). */
export const listActiveWithoutMigrationEmailInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.filter((u) => u.active && u.authMigrationEmailSentAt === undefined);
  },
});

export const markMigrationEmailSent = internalMutation({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (user) await ctx.db.patch(user._id, { authMigrationEmailSentAt: Date.now() });
  },
});

export const logAuditAction = internalMutation({
  args: {
    userId: v.string(),
    targetUserId: v.optional(v.string()),
    action: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("auditLogs", {
      userId: args.userId,
      targetUserId: args.targetUserId,
      action: args.action,
      metadata: args.metadata,
      createdAt: Date.now(),
    });
  },
});

/**
 * Elimina todos los documentos de una entidad pertenecientes al usuario.
 * Retorna el número de documentos eliminados.
 */
/**
 * Borra las sesiones de un usuario. Antes esto era un `deleteEntities`
 * genérico sobre 12 tablas, con casts para esquivar el tipado de Convex; hoy
 * las 15 tablas de datos se recorren desde `convex/lib/userData.ts` y este es
 * el único caso que quedaba vivo, así que puede ser una consulta normal.
 */
export const deleteEntities = internalMutation({
  args: { clerkId: v.string(), entity: v.literal("sessions") },
  handler: async (ctx, { clerkId }) => {
    const docs = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", clerkId))
      .collect();
    await Promise.all(docs.map((d) => ctx.db.delete(d._id)));
    return docs.length;
  },
});

// ─── Mutation interna: borrar usuario (llamada desde deleteUserCascade) ────────

/** Garantiza role=admin en un usuario existente (usado solo por seedAdmin). */
export const patchAdminRole = internalMutation({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (!user) return;
    if (user.role === "admin") return;
    await ctx.db.patch(user._id, { role: "admin", updatedAt: Date.now() });
  },
});

export const deleteByClerkId = internalMutation({
  args: { clerkId: v.string(), deletedBy: v.string() },
  handler: async (ctx, { clerkId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (!user) return;
    await ctx.db.delete(user._id);
  },
});

/** Refresca lastSeenAt solo si toca; ver shouldRefreshLastSeen. */
async function touchLastSeen(
  ctx: MutationCtx,
  user: Doc<"users">,
): Promise<void> {
  const now = Date.now();
  if (!shouldRefreshLastSeen(user.lastSeenAt, now)) return;
  await ctx.db.patch(user._id, { lastSeenAt: now });
}

/**
 * Correos de los administradores activos. La usa el aviso de nueva solicitud
 * de registro: así, un admin que se añada mañana se entera sin tocar ninguna
 * variable de entorno.
 */
export const listAdminEmailsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const admins = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .collect();
    return admins.filter((u) => u.active).map((u) => u.email);
  },
});

/**
 * Quita el flag de contraseña obligatoria. La llama users.setInitialPassword.
 *
 * `logAudit` es false cuando el flag se limpia porque la persona YA tenía
 * contraseña (la definió por /forgot-password): ahí no se cambió ninguna
 * contraseña y registrarlo sería mentir en el log.
 */
export const clearMustSetPassword = internalMutation({
  args: { clerkId: v.string(), logAudit: v.boolean() },
  handler: async (ctx, { clerkId, logAudit }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (!user) throw new Error("Usuario no encontrado");

    const now = Date.now();
    await ctx.db.patch(user._id, { mustSetPassword: false, updatedAt: now });

    if (logAudit) {
      await ctx.db.insert("auditLogs", {
        userId: clerkId,
        action: AUDIT_ACTIONS.USER_PASSWORD_CHANGED,
        createdAt: now,
      });
    }
  },
});

/**
 * Define la PRIMERA contraseña del usuario que ya tiene sesión.
 *
 * `auth.api.setPassword` es `serverOnly` en Better Auth: no está expuesto por
 * HTTP, así que no existe `authClient.setPassword` y tiene que llamarse desde
 * acá. `authComponent.getAuth` arma los headers de la sesión actual a partir de
 * `identity.sessionId` — es la forma soportada de llamar a un endpoint con
 * sesión desde una función de Convex.
 *
 * Nota para quien mantenga convex/auth.ts: `getHeaders` depende de que
 * `sessionId` esté en el payload del JWT. Lo inyecta el plugin de Convex
 * DESPUÉS de esparcir nuestro `definePayload`, así que sobrevive aunque ese
 * callback no lo mencione. No lo quites.
 *
 * `setPassword` lanza PASSWORD_ALREADY_SET si la cuenta ya tiene contraseña, y
 * ese error SE CAPTURA. Si se dejara propagar sería un bloqueo permanente:
 * alguien con el flag puesto puede abrir /forgot-password en otra pestaña (es
 * ruta pública), definir su contraseña por ahí, volver, y quedar rebotando
 * para siempre contra una pantalla que no puede completar.
 */
export const setInitialPassword = action({
  args: { newPassword: v.string() },
  handler: async (ctx, { newPassword }): Promise<{ alreadyHadPassword: boolean }> => {
    const user = await getCurrentUserFromAction(ctx);
    // Solo quien tiene el flag puesto. Sin esto, cualquier sesión de una cuenta
    // sin contraseña —un usuario migrado que solo entró por magic link, por
    // ejemplo— podría fijar una sin reautenticarse, y una sesión robada se
    // convertiría en acceso permanente que sobrevive a revocar la sesión.
    if (user.mustSetPassword !== true) {
      throw new Error("Tu contraseña ya está definida. Cámbiala desde tu perfil.");
    }

    const { auth, headers } = await authComponent.getAuth(createAuth, ctx);

    let alreadyHadPassword = false;
    try {
      await auth.api.setPassword({ body: { newPassword }, headers });
    } catch (err) {
      // El APIError de Better Auth lleva el código en `body.code`; esa es la
      // vía buena. El texto del mensaje es el respaldo por si el error llega
      // envuelto y pierde el cuerpo. Cualquier otro fallo (contraseña corta,
      // sesión inválida) se vuelve a lanzar para que el usuario lo vea.
      const codigo = (err as { body?: { code?: string } })?.body?.code;
      const mensaje = err instanceof Error ? err.message : String(err);
      const yaTenia =
        codigo === "PASSWORD_ALREADY_SET" ||
        /PASSWORD_ALREADY_SET/.test(mensaje) ||
        /already\s*set/i.test(mensaje);
      if (!yaTenia) throw err;
      alreadyHadPassword = true;
    }

    await ctx.runMutation(internal.users.clearMustSetPassword, {
      clerkId: user.clerkId,
      logAudit: !alreadyHadPassword,
    });

    return { alreadyHadPassword };
  },
});
