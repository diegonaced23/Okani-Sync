import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser, getCurrentUserId } from "./lib/auth";

// ─── Queries ──────────────────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await getCurrentUserId(ctx);
    return await ctx.db
      .query("accounts")
      .withIndex("by_owner_archived", (q) =>
        q.eq("ownerId", clerkId).eq("archived", false)
      )
      .collect();
  },
});

export const getById = query({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    const clerkId = await getCurrentUserId(ctx);
    const account = await ctx.db.get(accountId);
    if (!account) return null;
    if (account.ownerId === clerkId) return account;

    const share = await ctx.db
      .query("accountShares")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .filter((q) =>
        q.and(
          q.eq(q.field("sharedWithUserId"), clerkId),
          q.eq(q.field("status"), "aceptada")
        )
      )
      .unique();
    return share ? account : null;
  },
});

export const listSharedWithMe = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await getCurrentUserId(ctx);
    const shares = await ctx.db
      .query("accountShares")
      .withIndex("by_shared_user_status", (q) =>
        q.eq("sharedWithUserId", clerkId).eq("status", "aceptada")
      )
      .collect();
    const accounts = await Promise.all(shares.map((s) => ctx.db.get(s.accountId)));
    return accounts.filter(Boolean);
  },
});

export const listPendingInvitations = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await getCurrentUserId(ctx);
    return await ctx.db
      .query("accountShares")
      .withIndex("by_shared_user_status", (q) =>
        q.eq("sharedWithUserId", clerkId).eq("status", "pendiente")
      )
      .collect();
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    name: v.string(),
    type: v.union(
      v.literal("billetera"),
      v.literal("bancaria"),
      v.literal("ahorros"),
      v.literal("inversion")
    ),
    bankName: v.optional(v.string()),
    accountNumber: v.optional(v.string()),
    initialBalance: v.number(), // en centavos
    currency: v.string(),
    color: v.string(),
    icon: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const now = Date.now();
    return await ctx.db.insert("accounts", {
      ownerId: user.clerkId,
      name: args.name,
      type: args.type,
      bankName: args.bankName,
      accountNumber: args.accountNumber,
      balance: args.initialBalance,
      initialBalance: args.initialBalance,
      currency: args.currency,
      color: args.color,
      icon: args.icon,
      isDefault: false,
      isShared: false,
      archived: false,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    accountId: v.id("accounts"),
    name: v.optional(v.string()),
    bankName: v.optional(v.string()),
    accountNumber: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { accountId, ...fields }) => {
    const user = await getCurrentUser(ctx);
    const account = await ctx.db.get(accountId);
    if (!account || account.ownerId !== user.clerkId) {
      throw new Error("Cuenta no encontrada o sin permisos");
    }
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) patch[k] = v;
    }
    await ctx.db.patch(accountId, patch);
  },
});

export const archive = mutation({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    const user = await getCurrentUser(ctx);
    const account = await ctx.db.get(accountId);
    if (!account || account.ownerId !== user.clerkId) {
      throw new Error("Cuenta no encontrada o sin permisos");
    }
    if (account.isDefault) {
      throw new Error("No se puede archivar la cuenta por defecto");
    }
    await ctx.db.patch(accountId, { archived: true, updatedAt: Date.now() });
  },
});
