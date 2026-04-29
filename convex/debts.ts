import { query, mutation } from "./_generated/server";
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
