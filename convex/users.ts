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

// ─── Query interna: buscar usuario por clerkId ────────────────────────────────

export const getByClerkId = query({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }) => {
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

    // Crear usuario nuevo
    const userId = await ctx.db.insert("users", {
      clerkId: args.clerkId,
      email: args.email,
      name: args.name,
      imageUrl: args.imageUrl,
      role: "user",
      active: true,
      locale: "es-CO",
      currency: "COP",
      theme: "dark",
      createdAt: Date.now(),
      updatedAt: Date.now(),
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
