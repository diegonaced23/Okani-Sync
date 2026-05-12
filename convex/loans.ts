import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getCurrentUser, getCurrentUserId } from "./lib/auth";
import { assertCanWrite } from "./lib/permissions";
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
    archived: v.optional(v.boolean()),
  },
  handler: async (ctx, { status, archived }) => {
    const clerkId = await getCurrentUserId(ctx);
    if (archived !== undefined) {
      return await ctx.db
        .query("loans")
        .withIndex("by_user_archived", (q) =>
          q.eq("userId", clerkId).eq("archived", archived)
        )
        .collect();
    }
    if (status) {
      return await ctx.db
        .query("loans")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", clerkId).eq("status", status)
        )
        .collect();
    }
    return await ctx.db
      .query("loans")
      .withIndex("by_user", (q) => q.eq("userId", clerkId))
      .collect();
  },
});

export const getById = query({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const clerkId = await getCurrentUserId(ctx);
    const loan = await ctx.db.get(loanId);
    if (!loan || loan.userId !== clerkId) return null;
    return loan;
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    name: v.string(),
    borrower: v.string(),
    originalAmount: v.number(),            // en centavos
    currency: v.string(),
    startDate: v.number(),
    dueDate: v.optional(v.number()),
    fromAccountId: v.optional(v.id("accounts")),
    color: v.string(),
    icon: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.name.length === 0 || args.name.length > 100) throw new Error("El nombre debe tener entre 1 y 100 caracteres");
    if (args.borrower.length === 0 || args.borrower.length > 100) throw new Error("El nombre de la persona debe tener entre 1 y 100 caracteres");
    if (args.originalAmount <= 0 || !Number.isFinite(args.originalAmount)) throw new Error("El monto debe ser mayor que cero");
    if (args.originalAmount > 9_999_999_999) throw new Error("Monto fuera de rango permitido");
    if (!/^[A-Za-z]{3}$/.test(args.currency)) throw new Error("Código de moneda inválido");
    if (args.notes !== undefined && args.notes.length > 500) throw new Error("Las notas no pueden superar 500 caracteres");

    const user = await getCurrentUser(ctx);

    if (args.fromAccountId) {
      await assertCanWrite(ctx, args.fromAccountId);
    }

    const now = Date.now();
    const month = toMonthString(args.startDate);

    // Crear el préstamo
    const loanId = await ctx.db.insert("loans", {
      userId: user.clerkId,
      name: args.name,
      borrower: args.borrower,
      originalAmount: args.originalAmount,
      currentBalance: args.originalAmount,
      currency: args.currency,
      startDate: args.startDate,
      dueDate: args.dueDate,
      status: "activa",
      color: args.color,
      icon: args.icon,
      archived: false,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });

    // Crear la transacción de gasto vinculada
    await ctx.db.insert("transactions", {
      userId: user.clerkId,
      type: "gasto",
      amount: args.originalAmount,
      description: `Préstamo a ${args.borrower}`,
      date: args.startDate,
      month,
      currency: args.currency,
      accountId: args.fromAccountId,
      loanId,
      status: "completada",
      isRecurring: false,
      createdAt: now,
      updatedAt: now,
    });

    // Debitar la cuenta de origen si se especificó
    if (args.fromAccountId) {
      await applyAccountDelta(ctx, args.fromAccountId, -args.originalAmount);
    }

    return loanId;
  },
});

export const update = mutation({
  args: {
    loanId: v.id("loans"),
    name: v.optional(v.string()),
    borrower: v.optional(v.string()),
    dueDate: v.optional(v.number()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { loanId, ...fields }) => {
    if (fields.name !== undefined && (fields.name.length === 0 || fields.name.length > 100)) throw new Error("El nombre debe tener entre 1 y 100 caracteres");
    if (fields.borrower !== undefined && (fields.borrower.length === 0 || fields.borrower.length > 100)) throw new Error("El nombre de la persona debe tener entre 1 y 100 caracteres");
    if (fields.notes !== undefined && fields.notes.length > 500) throw new Error("Las notas no pueden superar 500 caracteres");

    const user = await getCurrentUser(ctx);
    const loan = await ctx.db.get(loanId);
    if (!loan || loan.userId !== user.clerkId) throw new Error("Préstamo no encontrado");

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, val] of Object.entries(fields)) {
      if (val !== undefined) patch[k] = val;
    }
    await ctx.db.patch(loanId, patch);
  },
});

/** Registra un abono recibido. Crea loanRepayment + transaction ingreso + actualiza saldo. */
export const addRepayment = mutation({
  args: {
    loanId: v.id("loans"),
    amount: v.number(),                    // en centavos
    date: v.optional(v.number()),
    toAccountId: v.optional(v.id("accounts")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.amount <= 0 || !Number.isFinite(args.amount)) throw new Error("El monto del abono debe ser mayor que cero");
    if (args.amount > 9_999_999_999) throw new Error("Monto fuera de rango permitido");
    if (args.notes !== undefined && args.notes.length > 500) throw new Error("Las notas no pueden superar 500 caracteres");

    const user = await getCurrentUser(ctx);
    const loan = await ctx.db.get(args.loanId);
    if (!loan || loan.userId !== user.clerkId) throw new Error("Préstamo no encontrado");
    if (loan.status === "pagada") throw new Error("Este préstamo ya está pagado");
    if (loan.archived) throw new Error("No se puede abonar a un préstamo archivado");

    if (args.toAccountId) {
      await assertCanWrite(ctx, args.toAccountId);
    }

    const paymentDate = args.date ?? Date.now();
    const month = toMonthString(paymentDate);
    const now = Date.now();

    // Crear transacción de ingreso vinculada
    const txId = await ctx.db.insert("transactions", {
      userId: user.clerkId,
      type: "ingreso",
      amount: args.amount,
      description: `Abono préstamo — ${loan.borrower}`,
      date: paymentDate,
      month,
      currency: loan.currency,
      accountId: args.toAccountId,
      loanId: args.loanId,
      status: "completada",
      isRecurring: false,
      createdAt: now,
      updatedAt: now,
    });

    // Crear registro en loanRepayments
    await ctx.db.insert("loanRepayments", {
      userId: user.clerkId,
      loanId: args.loanId,
      amount: args.amount,
      currency: loan.currency,
      date: paymentDate,
      month,
      transactionId: txId,
      notes: args.notes,
      createdAt: now,
    });

    // Actualizar saldo del préstamo
    const newBalance = Math.max(0, loan.currentBalance - args.amount);
    const fullyPaid = newBalance === 0;
    await ctx.db.patch(args.loanId, {
      currentBalance: newBalance,
      status: fullyPaid ? "pagada" : loan.status,
      updatedAt: now,
    });

    // Acreditar la cuenta de destino si se especificó
    if (args.toAccountId) {
      await applyAccountDelta(ctx, args.toAccountId, args.amount);
    }

    return txId;
  },
});

export const setArchived = mutation({
  args: { loanId: v.id("loans"), archived: v.boolean() },
  handler: async (ctx, { loanId, archived }) => {
    const user = await getCurrentUser(ctx);
    const loan = await ctx.db.get(loanId);
    if (!loan || loan.userId !== user.clerkId) throw new Error("Préstamo no encontrado");
    await ctx.db.patch(loanId, { archived, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const user = await getCurrentUser(ctx);
    const loan = await ctx.db.get(loanId);
    if (!loan || loan.userId !== user.clerkId) throw new Error("Préstamo no encontrado");
    if (!loan.archived) throw new Error("Solo se pueden eliminar préstamos archivados");

    // Revertir transacciones vinculadas (deshacer deltas de cuenta)
    const txs = await ctx.db
      .query("transactions")
      .withIndex("by_user", (q) => q.eq("userId", user.clerkId))
      .filter((q) => q.eq(q.field("loanId"), loanId))
      .collect();

    for (const tx of txs) {
      // Revertir delta de cuenta si aplica
      if (tx.accountId) {
        const delta = tx.type === "ingreso" ? -tx.amount : tx.amount;
        await applyAccountDelta(ctx, tx.accountId, delta);
      }
      await ctx.db.delete(tx._id);
    }

    // Eliminar abonos
    const repayments = await ctx.db
      .query("loanRepayments")
      .withIndex("by_loan", (q) => q.eq("loanId", loanId))
      .collect();
    for (const r of repayments) {
      await ctx.db.delete(r._id);
    }

    await ctx.db.delete(loanId);
  },
});

// ─── Internals para el cron ───────────────────────────────────────────────────

export const listOverdue = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const all = await ctx.db
      .query("loans")
      .filter((q) => q.eq(q.field("status"), "activa"))
      .collect();
    return all.filter((l) => l.dueDate !== undefined && l.dueDate < now);
  },
});

export const listDueSoon = internalQuery({
  args: { now: v.number(), beforeTs: v.number() },
  handler: async (ctx, { now, beforeTs }) => {
    const dueSoon = await ctx.db
      .query("loans")
      .withIndex("by_status_dueDate", (q) =>
        q.eq("status", "activa").gte("dueDate", now)
      )
      .take(500);
    return dueSoon.filter((l) => l.dueDate !== undefined && l.dueDate <= beforeTs);
  },
});

export const markOverdueInternal = internalMutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    await ctx.db.patch(loanId, { status: "vencida", updatedAt: Date.now() });
  },
});
