import { internalMutation, internalQuery, query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { DEFAULT_CATEGORIES, AUDIT_ACTIONS } from "../src/lib/constants";

// ─── Query pública: usuario autenticado actual ────────────────────────────────

export const getMe = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
  },
});

/**
 * Crea el documento de usuario si aún no existe (carrera webhook vs. primer acceso).
 * Llamar desde el cliente inmediatamente después del login.
 */
export const ensureExists = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("No autenticado");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (existing) {
      if (!existing.active) throw new Error("No autorizado: usuario desactivado");
      return existing._id;
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

    return userId;
  },
});

/** Actualiza la moneda preferida del usuario. */
export const updateCurrency = mutation({
  args: { currency: v.string() },
  handler: async (ctx, { currency }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("No autenticado");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("Usuario no encontrado");
    await ctx.db.patch(user._id, { currency, updatedAt: Date.now() });
  },
});

/** Actualiza el tema del usuario. */
export const updateTheme = mutation({
  args: {
    theme: v.union(v.literal("light"), v.literal("dark"), v.literal("system")),
  },
  handler: async (ctx, { theme }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("No autenticado");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("Usuario no encontrado");
    await ctx.db.patch(user._id, { theme, updatedAt: Date.now() });
  },
});

// ─── Query interna: buscar usuario por clerkId ────────────────────────────────

export const getByClerkId = query({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    // Solo el propio usuario o un admin pueden consultar datos completos de otro usuario
    if (identity.subject !== clerkId) {
      const caller = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
        .unique();
      if (!caller || caller.role !== "admin") return null;
    }
    return await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();
  },
});

// ─── Mutation interna: sincronizar desde webhook Clerk ────────────────────────

export const upsertFromClerk = internalMutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    imageUrl: v.optional(v.string()),
    role: v.optional(v.union(v.literal("user"), v.literal("admin"))),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        email: args.email,
        imageUrl: args.imageUrl,
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    // Usuario nuevo: verificar que tiene una invitación pendiente
    const invitation = await ctx.db
      .query("invitations")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();

    if (!invitation) return; // No invitado — no crear en Convex

    const userId = await ctx.db.insert("users", {
      clerkId: args.clerkId,
      email: args.email,
      name: args.name,
      imageUrl: args.imageUrl,
      role: invitation.role,
      active: true,
      locale: "es-CO",
      currency: "COP",
      theme: "dark",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.patch(invitation._id, { status: "accepted", acceptedAt: Date.now() });

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
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Seed: categorías por defecto
    const now = Date.now();
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

    return userId;
  },
});

// ─── Queries admin ────────────────────────────────────────────────────────────

/** Lista todos los usuarios (solo admins). */
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!caller || caller.role !== "admin") return [];
    return await ctx.db.query("users").order("desc").collect();
  },
});

/** Estadísticas globales de la app para el dashboard admin. */
export const adminStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("No autenticado");
    const caller = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!caller || caller.role !== "admin") throw new Error("Acceso denegado");

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
      userId: identity.subject,
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
