import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getCurrentUser, getCurrentUserId } from "./lib/auth";
import { toMonthString } from "./lib/utils";

async function applyAccountDelta(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  delta: number
) {
  const account = await ctx.db.get(accountId);
  if (!account) throw new Error("Cuenta no encontrada");
  await ctx.db.patch(accountId, {
    balance: account.balance + delta,
    updatedAt: Date.now(),
  });
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export const list = query({
  args: {
    status: v.optional(
      v.union(v.literal("activa"), v.literal("pagada"), v.literal("vencida"))
    ),
  },
  handler: async (ctx, { status }) => {
    const clerkId = await getCurrentUserId(ctx);
    if (status) {
      return await ctx.db
        .query("debts")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", clerkId).eq("status", status)
        )
        .collect();
    }
    return await ctx.db
      .query("debts")
      .withIndex("by_user", (q) => q.eq("userId", clerkId))
      .collect();
  },
});

export const getById = query({
  args: { debtId: v.id("debts") },
  handler: async (ctx, { debtId }) => {
    const clerkId = await getCurrentUserId(ctx);
    const debt = await ctx.db.get(debtId);
    if (!debt || debt.userId !== clerkId) return null;
    return debt;
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    creditor: v.string(),
    type: v.union(
      v.literal("prestamo"),
      v.literal("personal"),
      v.literal("hipoteca"),
      v.literal("vehiculo"),
      v.literal("otro")
    ),
    originalAmount: v.number(),   // en centavos
    interestRate: v.optional(v.number()),
    monthlyPayment: v.optional(v.number()),
    startDate: v.number(),
    dueDate: v.optional(v.number()),
    currency: v.string(),
    color: v.string(),
    icon: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.name.length === 0 || args.name.length > 100) throw new Error("El nombre debe tener entre 1 y 100 caracteres");
    if (args.creditor.length === 0 || args.creditor.length > 100) throw new Error("El acreedor debe tener entre 1 y 100 caracteres");
    if (args.originalAmount <= 0 || !Number.isFinite(args.originalAmount)) throw new Error("El monto original debe ser mayor que cero");
    if (args.originalAmount > 9_999_999_999) throw new Error("Monto fuera de rango permitido");
    if (!/^[A-Za-z]{3}$/.test(args.currency)) throw new Error("Código de moneda inválido");
    if (args.interestRate !== undefined && (args.interestRate < 0 || args.interestRate > 1000)) throw new Error("La tasa de interés debe estar entre 0 y 1000");
    if (args.monthlyPayment !== undefined && (args.monthlyPayment <= 0 || !Number.isFinite(args.monthlyPayment))) throw new Error("El pago mensual debe ser mayor que cero");
    if (args.description !== undefined && args.description.length > 500) throw new Error("La descripción no puede superar 500 caracteres");
    if (args.notes !== undefined && args.notes.length > 500) throw new Error("Las notas no pueden superar 500 caracteres");

    const user = await getCurrentUser(ctx);
    const now = Date.now();
    return await ctx.db.insert("debts", {
      userId: user.clerkId,
      name: args.name,
      description: args.description,
      creditor: args.creditor,
      type: args.type,
      originalAmount: args.originalAmount,
      currentBalance: args.originalAmount,  // saldo inicial = monto original
      interestRate: args.interestRate,
      monthlyPayment: args.monthlyPayment,
      startDate: args.startDate,
      dueDate: args.dueDate,
      status: "activa",
      currency: args.currency,
      color: args.color,
      icon: args.icon,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    debtId: v.id("debts"),
    name: v.optional(v.string()),
    creditor: v.optional(v.string()),
    monthlyPayment: v.optional(v.number()),
    dueDate: v.optional(v.number()),
    color: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { debtId, ...fields }) => {
    if (fields.name !== undefined && (fields.name.length === 0 || fields.name.length > 100)) throw new Error("El nombre debe tener entre 1 y 100 caracteres");
    if (fields.creditor !== undefined && (fields.creditor.length === 0 || fields.creditor.length > 100)) throw new Error("El acreedor debe tener entre 1 y 100 caracteres");
    if (fields.monthlyPayment !== undefined && (fields.monthlyPayment <= 0 || !Number.isFinite(fields.monthlyPayment))) throw new Error("El pago mensual debe ser mayor que cero");
    if (fields.notes !== undefined && fields.notes.length > 500) throw new Error("Las notas no pueden superar 500 caracteres");

    const user = await getCurrentUser(ctx);
    const debt = await ctx.db.get(debtId);
    if (!debt || debt.userId !== user.clerkId) throw new Error("Deuda no encontrada");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) patch[k] = v;
    }
    await ctx.db.patch(debtId, patch);
  },
});

/** Registra un abono a la deuda. Crea debtPayment + transaction + actualiza saldo. */
export const addPayment = mutation({
  args: {
    debtId: v.id("debts"),
    amount: v.number(),           // en centavos
    date: v.optional(v.number()),
    fromAccountId: v.optional(v.id("accounts")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.amount <= 0 || !Number.isFinite(args.amount)) throw new Error("El monto del abono debe ser mayor que cero");
    if (args.amount > 9_999_999_999) throw new Error("Monto fuera de rango permitido");
    if (args.notes !== undefined && args.notes.length > 500) throw new Error("Las notas no pueden superar 500 caracteres");

    const user = await getCurrentUser(ctx);
    const debt = await ctx.db.get(args.debtId);
    if (!debt || debt.userId !== user.clerkId) throw new Error("Deuda no encontrada");
    if (debt.status === "pagada") throw new Error("Esta deuda ya está pagada");

    const paymentDate = args.date ?? Date.now();
    const month = toMonthString(paymentDate);
    const now = Date.now();

    // Crear transacción pago_deuda
    const txId = await ctx.db.insert("transactions", {
      userId: user.clerkId,
      type: "pago_deuda",
      amount: args.amount,
      description: `Abono — ${debt.name}`,
      date: paymentDate,
      month,
      currency: debt.currency,
      accountId: args.fromAccountId,
      debtId: args.debtId,
      status: "completada",
      isRecurring: false,
      createdAt: now,
      updatedAt: now,
    });

    // Crear registro en debtPayments
    await ctx.db.insert("debtPayments", {
      userId: user.clerkId,
      debtId: args.debtId,
      amount: args.amount,
      currency: debt.currency,
      date: paymentDate,
      month,
      transactionId: txId,
      notes: args.notes,
      createdAt: now,
    });

    // Actualizar saldo de la deuda
    const newBalance = Math.max(0, debt.currentBalance - args.amount);
    const fullyPaid = newBalance === 0;
    await ctx.db.patch(args.debtId, {
      currentBalance: newBalance,
      status: fullyPaid ? "pagada" : debt.status,
      updatedAt: now,
    });

    // Descontar de la cuenta de origen si se especificó
    if (args.fromAccountId) {
      await applyAccountDelta(ctx, args.fromAccountId, -args.amount);
    }

    return txId;
  },
});

/** Interna: deudas activas cuya fecha límite ya pasó. */
export const listOverdue = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const all = await ctx.db
      .query("debts")
      .filter((q) => q.eq(q.field("status"), "activa"))
      .collect();
    return all.filter((d) => d.dueDate !== undefined && d.dueDate < now);
  },
});

/** Interna: deudas activas cuya fecha de vencimiento es entre `now` y `beforeTs`. */
export const listDueSoon = internalQuery({
  args: { now: v.number(), beforeTs: v.number() },
  handler: async (ctx, { now, beforeTs }) => {
    const dueSoon = await ctx.db
      .query("debts")
      .withIndex("by_status_dueDate", (q) =>
        q.eq("status", "activa").gte("dueDate", now)
      )
      .take(500);
    return dueSoon.filter((d) => d.dueDate !== undefined && d.dueDate <= beforeTs);
  },
});

/** Interna: marcar deuda como vencida (desde cron). */
export const markOverdueInternal = internalMutation({
  args: { debtId: v.id("debts") },
  handler: async (ctx, { debtId }) => {
    await ctx.db.patch(debtId, { status: "vencida", updatedAt: Date.now() });
  },
});

/** Marca una deuda como vencida (llamado desde cron o manualmente). */
export const markOverdue = mutation({
  args: { debtId: v.id("debts") },
  handler: async (ctx, { debtId }) => {
    const user = await getCurrentUser(ctx);
    const debt = await ctx.db.get(debtId);
    if (!debt || debt.userId !== user.clerkId) throw new Error("Deuda no encontrada");
    if (debt.status !== "activa") return;
    await ctx.db.patch(debtId, { status: "vencida", updatedAt: Date.now() });
  },
});
