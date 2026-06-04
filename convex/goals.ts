import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getCurrentUser } from "./lib/auth";

// ─── Queries ─────────────────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    const goals = await ctx.db
      .query("goals")
      .withIndex("by_user", (q) => q.eq("userId", user.clerkId))
      .order("desc")
      .collect();

    // Enriquecer metas que tienen cuenta vinculada con el saldo actual de la cuenta
    return await Promise.all(
      goals.map(async (goal) => {
        if (!goal.linkedAccountId) return { ...goal, linkedAccount: undefined };
        const account = await ctx.db.get(goal.linkedAccountId);
        return {
          ...goal,
          linkedAccount: account
            ? { name: account.name, balance: account.balance, currency: account.currency, color: account.color }
            : undefined,
        };
      })
    );
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    targetAmount: v.number(),
    currentAmount: v.optional(v.number()),
    currency: v.string(),
    deadline: v.optional(v.number()),
    icon: v.string(),
    color: v.string(),
    notes: v.optional(v.string()),
    linkedAccountId: v.optional(v.id("accounts")),
  },
  handler: async (ctx, args) => {
    if (!args.name.trim()) throw new Error("El nombre de la meta es obligatorio");
    if (args.targetAmount <= 0) throw new Error("El monto objetivo debe ser mayor que cero");
    if (args.name.length > 80) throw new Error("El nombre no puede superar 80 caracteres");
    if (args.notes && args.notes.length > 500) throw new Error("Las notas no pueden superar 500 caracteres");

    const user = await getCurrentUser(ctx);
    const now = Date.now();
    const initial = Math.max(0, args.currentAmount ?? 0);
    const completed = initial >= args.targetAmount;

    return await ctx.db.insert("goals", {
      userId: user.clerkId,
      name: args.name.trim(),
      description: args.description?.trim() || undefined,
      targetAmount: args.targetAmount,
      currentAmount: initial,
      currency: args.currency,
      deadline: args.deadline,
      icon: args.icon,
      color: args.color,
      linkedAccountId: args.linkedAccountId,
      status: completed ? "completada" : "activa",
      notes: args.notes?.trim() || undefined,
      completedAt: completed ? now : undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    goalId: v.id("goals"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    targetAmount: v.optional(v.number()),
    currency: v.optional(v.string()),
    deadline: v.optional(v.number()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
    notes: v.optional(v.string()),
    linkedAccountId: v.optional(v.id("accounts")),
  },
  handler: async (ctx, { goalId, ...fields }) => {
    if (fields.name !== undefined && !fields.name.trim()) throw new Error("El nombre no puede estar vacío");
    if (fields.targetAmount !== undefined && fields.targetAmount <= 0) throw new Error("El monto objetivo debe ser mayor que cero");

    const user = await getCurrentUser(ctx);
    const goal = await ctx.db.get(goalId);
    if (!goal || goal.userId !== user.clerkId) throw new Error("Meta no encontrada");

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) patch[k] = typeof v === "string" ? v.trim() || undefined : v;
    }

    // Si el nuevo objetivo baja por debajo del acumulado, marcar como completada
    const newTarget = (fields.targetAmount ?? goal.targetAmount);
    if (goal.currentAmount >= newTarget && goal.status === "activa") {
      patch.status = "completada";
      patch.completedAt = Date.now();
    }

    await ctx.db.patch(goalId, patch);
  },
});

/** Suma o resta centavos al acumulado. Completa automáticamente si llega al objetivo.
 *  Metas con cuenta vinculada no aceptan abonos manuales — el saldo lo controla la cuenta. */
export const addFunds = mutation({
  args: {
    goalId: v.id("goals"),
    delta: v.number(), // positivo = abonar, negativo = retirar (centavos)
  },
  handler: async (ctx, { goalId, delta }) => {
    const user = await getCurrentUser(ctx);
    const goal = await ctx.db.get(goalId);
    if (!goal || goal.userId !== user.clerkId) throw new Error("Meta no encontrada");
    if (goal.linkedAccountId) {
      throw new Error("Esta meta está vinculada a una cuenta de ahorro. Transfiere dinero a esa cuenta para actualizar el progreso automáticamente.");
    }
    if (delta === 0) return;

    const newAmount = Math.max(0, goal.currentAmount + delta);
    const completed = newAmount >= goal.targetAmount;
    const now = Date.now();

    await ctx.db.patch(goalId, {
      currentAmount: newAmount,
      status: completed ? "completada" : "activa",
      completedAt: completed && goal.status === "activa" ? now : goal.completedAt,
      updatedAt: now,
    });
  },
});

/** Interna: verifica si alguna meta vinculada a una cuenta debe auto-completarse. */
export const checkLinkedGoalCompletion = internalMutation({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    const account = await ctx.db.get(accountId);
    if (!account) return;

    const linkedGoals = await ctx.db
      .query("goals")
      .withIndex("by_linkedAccount", (q) => q.eq("linkedAccountId", accountId))
      .collect();

    const now = Date.now();
    for (const goal of linkedGoals) {
      if (goal.status === "activa" && account.balance >= goal.targetAmount) {
        await ctx.db.patch(goal._id, {
          status: "completada",
          completedAt: now,
          updatedAt: now,
        });
      }
    }
  },
});

/** Reactiva una meta completada (retiro parcial o ajuste). */
export const reactivate = mutation({
  args: { goalId: v.id("goals") },
  handler: async (ctx, { goalId }) => {
    const user = await getCurrentUser(ctx);
    const goal = await ctx.db.get(goalId);
    if (!goal || goal.userId !== user.clerkId) throw new Error("Meta no encontrada");

    await ctx.db.patch(goalId, {
      status: "activa",
      completedAt: undefined,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { goalId: v.id("goals") },
  handler: async (ctx, { goalId }) => {
    const user = await getCurrentUser(ctx);
    const goal = await ctx.db.get(goalId);
    if (!goal || goal.userId !== user.clerkId) throw new Error("Meta no encontrada");
    await ctx.db.delete(goalId);
  },
});
