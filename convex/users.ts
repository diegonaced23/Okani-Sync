import { internalMutation, internalQuery, query, mutation } from "./_generated/server";
import { v } from "convex/values";
import {
  DEFAULT_CATEGORIES,
  SYSTEM_CATEGORIES,
  AUDIT_ACTIONS,
  MAX_AVATAR_SIZE_BYTES,
  ALLOWED_AVATAR_MIME_TYPES,
  AVATAR_UPLOAD_THROTTLE_MS,
} from "../src/lib/constants";
import { getCurrentUser, getCurrentUserOrNull, assertAdmin } from "./lib/auth";
import { authComponent } from "./auth";
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
      return linked._id;
    }

    // Camino normal hoy: sesión de Clerk, el subject ya es el clerkId.
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (existing) {
      if (!existing.active) throw new Error("No autorizado: usuario desactivado");
      return existing._id;
    }

    // Solo para el enlace nuevo por email (ver nota de normalización abajo).
    // No se usa para la búsqueda de invitación ni para el email guardado —
    // ese camino conserva el comportamiento exacto de siempre (sin normalizar)
    // para no alterar el flujo de Clerk que ya está en producción.
    const normalizedEmail = (identity.email ?? "").toLowerCase().trim();

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
      await ctx.db.patch(legacy._id, { authId: identity.subject });
      return legacy._id;
    }

    // El webhook aún no llegó — verificar invitación antes de crear
    const email = identity.email ?? "";
    const invitation = await ctx.db
      .query("invitations")
      .withIndex("by_email", (q) => q.eq("email", email))
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
      email,
      name,
      imageUrl: identity.pictureUrl,
      role: invitation.role,
      active: true,
      locale: "es-CO",
      currency: "COP",
      theme: "dark",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(invitation._id, { status: "accepted", acceptedAt: now });

    await ctx.db.insert("accounts", {
      ownerId: identity.subject,
      name: "Billetera",
      type: "billetera",
      balance: 0,
      initialBalance: 0,
      currency: "COP",
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
        userId: identity.subject,
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

    for (const sysCat of SYSTEM_CATEGORIES) {
      await ctx.db.insert("categories", {
        userId: identity.subject,
        name: sysCat.name,
        type: sysCat.type,
        color: sysCat.color,
        icon: sysCat.icon,
        isDefault: false,
        isSystem: true,
        archived: false,
        createdAt: now,
        updatedAt: now,
      });
    }

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
export const updateName = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("El nombre no puede estar vacío");
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

export const getByClerkId = query({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }) => {
    const caller = await getCurrentUserOrNull(ctx);
    if (!caller) return null;
    // Solo el propio usuario o un admin pueden consultar datos completos de otro usuario.
    // Comparar contra caller.clerkId (no identity.subject): bajo Better Auth
    // identity.subject es el authId, no el clerkId, así que compararlo
    // directo haría fallar el check "soy yo mismo" para todo el mundo.
    if (caller.clerkId !== clerkId && caller.role !== "admin") return null;
    return await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();
  },
});

// ─── Queries admin ────────────────────────────────────────────────────────────

/** Lista todos los usuarios (solo admins). */
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    // getCurrentUserOrNull resuelve por by_clerkId y by_authId — identity.subject
    // directo es el authId bajo Better Auth, no matchea la fila del admin.
    const caller = await getCurrentUserOrNull(ctx);
    if (!caller || caller.role !== "admin") return [];
    return await ctx.db.query("users").order("desc").collect();
  },
});

/** Estadísticas globales de la app para el dashboard admin. */
export const adminStats = query({
  args: {},
  handler: async (ctx) => {
    const caller = await getCurrentUserOrNull(ctx);
    if (!caller || caller.role !== "admin") return null;

    const allUsers = await ctx.db.query("users").collect();
    const totalUsers = allUsers.length;
    const activeUsers = allUsers.filter((u) => u.active).length;
    const adminCount = allUsers.filter((u) => u.role === "admin").length;

    const totalTransactions = (await ctx.db.query("transactions").take(100000)).length;

    return { totalUsers, activeUsers, adminCount, totalTransactions };
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

/** Usado solo por seedAdmin para su chequeo de idempotencia (sin clerkId estable de Clerk que buscar). */
export const getByEmailInternal = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
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
      email: args.email,
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

    // Seed: cuenta Billetera por defecto
    await ctx.db.insert("accounts", {
      ownerId: args.clerkId,
      name: "Billetera",
      type: "billetera",
      balance: 0,
      initialBalance: 0,
      currency: "COP",
      color: "#4ADE80",
      icon: "wallet",
      isDefault: true,
      isShared: false,
      archived: false,
      createdAt: now,
      updatedAt: now,
    });

    // Seed: categorías por defecto
    for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
      const cat = DEFAULT_CATEGORIES[i];
      await ctx.db.insert("categories", {
        userId: args.clerkId,
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

    for (const sysCat of SYSTEM_CATEGORIES) {
      await ctx.db.insert("categories", {
        userId: args.clerkId,
        name: sysCat.name,
        type: sysCat.type,
        color: sysCat.color,
        icon: sysCat.icon,
        isDefault: false,
        isSystem: true,
        archived: false,
        createdAt: now,
        updatedAt: now,
      });
    }

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
export const deleteEntities = internalMutation({
  args: {
    clerkId: v.string(),
    entity: v.union(
      v.literal("notifications"),
      v.literal("pushSubscriptions"),
      v.literal("sessions"),
      v.literal("cardInstallments"),
      v.literal("cardPurchases"),
      v.literal("cards"),
      v.literal("debtPayments"),
      v.literal("debts"),
      v.literal("transactions"),
      v.literal("budgets"),
      v.literal("recurringTransactions"),
      v.literal("categories")
    ),
  },
  handler: async (ctx, { clerkId, entity }) => {
    // filter() en lugar de withIndex() genérico — scan aceptable para
    // esta operación de baja frecuencia (borrado de usuario).
    const docs = await (ctx.db.query(entity as "notifications") as ReturnType<typeof ctx.db.query<"notifications">>)
      .filter((q) => q.eq(q.field("userId" as "_id"), clerkId as unknown as import("./_generated/dataModel").Id<"notifications">))
      .collect() as Array<{ _id: import("./_generated/dataModel").Id<"notifications"> }>;

    await Promise.all(docs.map((d) => ctx.db.delete(d._id)));
    return docs.length;
  },
});

export const deleteAccountSharesAsGuest = internalMutation({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }) => {
    const shares = await ctx.db
      .query("accountShares")
      .withIndex("by_shared_user", (q) => q.eq("sharedWithUserId", clerkId))
      .collect();
    await Promise.all(shares.map((s) => ctx.db.delete(s._id)));
    return shares.length;
  },
});

export const deleteOwnedAccounts = internalMutation({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }) => {
    const accounts = await ctx.db
      .query("accounts")
      .withIndex("by_owner", (q) => q.eq("ownerId", clerkId))
      .collect();

    let count = accounts.length;
    for (const account of accounts) {
      // Eliminar shares de cada cuenta
      const shares = await ctx.db
        .query("accountShares")
        .withIndex("by_account", (q) => q.eq("accountId", account._id))
        .collect();
      await Promise.all(shares.map((s) => ctx.db.delete(s._id)));
      count += shares.length;
      await ctx.db.delete(account._id);
    }
    return count;
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
