import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser, getCurrentUserId } from "./lib/auth";

// Calcula el próximo timestamp de ejecución mensual a partir de hoy.
// Si el día del mes ya pasó en el mes actual, programa para el mes siguiente.
// Hora 12:00 local garantiza que el cron diario de las 12:00 UTC lo procese
// el mismo día en Colombia (UTC-5).
function computeNextOccurrence(now: number, dayOfMonth: number): number {
  const today = new Date(now);
  const currentDay = today.getDate();
  if (currentDay < dayOfMonth) {
    return new Date(
      today.getFullYear(), today.getMonth(), dayOfMonth, 12, 0, 0
    ).getTime();
  }
  return new Date(
    today.getFullYear(), today.getMonth() + 1, dayOfMonth, 12, 0, 0
  ).getTime();
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await getCurrentUserId(ctx);
    return await ctx.db
      .query("recurringTransactions")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", clerkId).eq("active", true)
      )
      .collect();
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    description: v.string(),
    amount: v.number(),
    accountId: v.optional(v.id("accounts")),
    cardId: v.optional(v.id("cards")),
    categoryId: v.optional(v.id("categories")),
    dayOfMonth: v.number(),
    currency: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.description.trim().length === 0 || args.description.length > 100)
      throw new Error("La descripción debe tener entre 1 y 100 caracteres");
    if (args.amount <= 0 || !Number.isFinite(args.amount))
      throw new Error("El monto debe ser mayor que cero");
    if (!Number.isInteger(args.dayOfMonth) || args.dayOfMonth < 1 || args.dayOfMonth > 28)
      throw new Error("El día del mes debe estar entre 1 y 28");
    if (!/^[A-Za-z]{3}$/.test(args.currency))
      throw new Error("Código de moneda inválido");
    if (args.accountId !== undefined && args.cardId !== undefined)
      throw new Error("Selecciona solo una cuenta o tarjeta, no ambas");
    if (args.accountId === undefined && args.cardId === undefined)
      throw new Error("Debes seleccionar una cuenta o tarjeta");

    const user = await getCurrentUser(ctx);

    if (args.accountId !== undefined) {
      const account = await ctx.db.get(args.accountId);
      if (!account || account.ownerId !== user.clerkId)
        throw new Error("Cuenta no encontrada");
    }
    if (args.cardId !== undefined) {
      const card = await ctx.db.get(args.cardId);
      if (!card || card.userId !== user.clerkId)
        throw new Error("Tarjeta no encontrada");
    }
    if (args.categoryId !== undefined) {
      const cat = await ctx.db.get(args.categoryId);
      if (!cat || cat.userId !== user.clerkId)
        throw new Error("Categoría no encontrada");
      if (cat.type !== "gasto" && cat.type !== "ambos")
        throw new Error("La categoría debe ser de tipo gasto");
    }

    const now = Date.now();
    return await ctx.db.insert("recurringTransactions", {
      userId: user.clerkId,
      type: "gasto",
      frequency: "mensual",
      description: args.description.trim(),
      amount: args.amount,
      accountId: args.accountId,
      cardId: args.cardId,
      categoryId: args.categoryId,
      dayOfMonth: args.dayOfMonth,
      currency: args.currency,
      startDate: now,
      nextOccurrence: computeNextOccurrence(now, args.dayOfMonth),
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    recurringId: v.id("recurringTransactions"),
    description: v.optional(v.string()),
    amount: v.optional(v.number()),
    accountId: v.optional(v.id("accounts")),
    cardId: v.optional(v.id("cards")),
    categoryId: v.optional(v.id("categories")),
    clearCategory: v.optional(v.boolean()),
    dayOfMonth: v.optional(v.number()),
  },
  handler: async (ctx, { recurringId, ...fields }) => {
    if (fields.description !== undefined && (fields.description.trim().length === 0 || fields.description.length > 100))
      throw new Error("La descripción debe tener entre 1 y 100 caracteres");
    if (fields.amount !== undefined && (fields.amount <= 0 || !Number.isFinite(fields.amount)))
      throw new Error("El monto debe ser mayor que cero");
    if (fields.dayOfMonth !== undefined && (!Number.isInteger(fields.dayOfMonth) || fields.dayOfMonth < 1 || fields.dayOfMonth > 28))
      throw new Error("El día del mes debe estar entre 1 y 28");

    const user = await getCurrentUser(ctx);
    const rec = await ctx.db.get(recurringId);
    if (!rec || rec.userId !== user.clerkId)
      throw new Error("Recurrente no encontrado");

    if (fields.accountId !== undefined) {
      const account = await ctx.db.get(fields.accountId);
      if (!account || account.ownerId !== user.clerkId)
        throw new Error("Cuenta no encontrada");
    }
    if (fields.cardId !== undefined) {
      const card = await ctx.db.get(fields.cardId);
      if (!card || card.userId !== user.clerkId)
        throw new Error("Tarjeta no encontrada");
    }
    if (fields.categoryId !== undefined) {
      const cat = await ctx.db.get(fields.categoryId);
      if (!cat || cat.userId !== user.clerkId)
        throw new Error("Categoría no encontrada");
    }

    const now = Date.now();
    const patch: Record<string, unknown> = { updatedAt: now };

    if (fields.description !== undefined) patch.description = fields.description.trim();
    if (fields.amount !== undefined) patch.amount = fields.amount;

    // Cambio de fuente: si llega uno, limpia el otro
    if (fields.accountId !== undefined) {
      patch.accountId = fields.accountId;
      patch.cardId = undefined;
    }
    if (fields.cardId !== undefined) {
      patch.cardId = fields.cardId;
      patch.accountId = undefined;
    }

    if (fields.categoryId !== undefined) patch.categoryId = fields.categoryId;
    if (fields.clearCategory === true) patch.categoryId = undefined;

    if (fields.dayOfMonth !== undefined) {
      patch.dayOfMonth = fields.dayOfMonth;
      patch.nextOccurrence = computeNextOccurrence(now, fields.dayOfMonth);
    }

    await ctx.db.patch(recurringId, patch);
  },
});

// Soft delete: desactiva el recurrente para que el cron no lo procese.
// Las transacciones pasadas con recurringId apuntando aquí se mantienen intactas.
export const remove = mutation({
  args: { recurringId: v.id("recurringTransactions") },
  handler: async (ctx, { recurringId }) => {
    const user = await getCurrentUser(ctx);
    const rec = await ctx.db.get(recurringId);
    if (!rec || rec.userId !== user.clerkId)
      throw new Error("Recurrente no encontrado");
    await ctx.db.patch(recurringId, { active: false, updatedAt: Date.now() });
  },
});
