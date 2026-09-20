import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getCurrentUser, getCurrentUserId } from "./lib/auth";
import { assertCanWrite } from "./lib/permissions";
import { getUserRateMap, convertAmount } from "./lib/money";
import { applyAccountDelta, deleteTransactionWithEffects, reopenedStatus } from "./lib/transactionEffects";
import { toMonthString } from "./lib/utils";

const debtType = v.union(
  v.literal("prestamo"),
  v.literal("personal"),
  v.literal("hipoteca"),
  v.literal("vehiculo"),
  v.literal("otro")
);

async function getOwnedDebt(ctx: MutationCtx, userId: string, debtId: Id<"debts">) {
  const debt = await ctx.db.get(debtId);
  if (!debt || debt.userId !== userId) throw new Error("Deuda no encontrada");
  return debt;
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

/**
 * Totales de deudas y préstamos en la moneda preferida (cada uno puede estar en
 * su propia moneda): cuánto debes, cuánto pagas al mes y cuánto te deben.
 * Excluye archivados; los saldados solo cuentan en lo ya pagado/cobrado.
 */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    const { rateMap, preferredCurrency } = await getUserRateMap(ctx, user);
    let missingRate = false;
    const conv = (amount: number, currency: string) => {
      const { converted, hasRate } = convertAmount(amount, currency, preferredCurrency, rateMap);
      if (!hasRate) missingRate = true;
      return hasRate ? converted : 0;
    };

    const [debts, loans] = await Promise.all([
      ctx.db.query("debts").withIndex("by_user", (q) => q.eq("userId", user.clerkId)).take(500),
      ctx.db.query("loans").withIndex("by_user", (q) => q.eq("userId", user.clerkId)).take(500),
    ]);

    let debtPending = 0, debtOriginal = 0, debtMonthly = 0, debtOverdue = 0;
    for (const d of debts) {
      if (d.archived) continue;
      debtOriginal += conv(d.originalAmount, d.currency);
      if (d.status === "pagada") continue;
      debtPending += conv(d.currentBalance, d.currency);
      if (d.monthlyPayment) debtMonthly += conv(Math.min(d.monthlyPayment, d.currentBalance), d.currency);
      if (d.status === "vencida") debtOverdue += 1;
    }

    let loanPending = 0, loanOriginal = 0, loanOverdue = 0;
    for (const l of loans) {
      if (l.archived) continue;
      loanOriginal += conv(l.originalAmount, l.currency);
      if (l.status === "pagada") continue;
      loanPending += conv(l.currentBalance, l.currency);
      if (l.status === "vencida") loanOverdue += 1;
    }

    return {
      currency: preferredCurrency,
      debtPending,
      debtOriginal,
      debtMonthly,
      debtOverdue,
      loanPending,
      loanOriginal,
      loanOverdue,
      missingRate,
    };
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    creditor: v.string(),
    type: debtType,
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
      archived: false,
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
    type: v.optional(debtType),
    interestRate: v.optional(v.number()),
    monthlyPayment: v.optional(v.number()),
    dueDate: v.optional(v.number()),
    color: v.optional(v.string()),
    notes: v.optional(v.string()),
    /** Quitar campos opcionales (no se puede con `undefined` en los args) */
    clear: v.optional(v.array(v.union(
      v.literal("interestRate"),
      v.literal("monthlyPayment"),
      v.literal("dueDate"),
      v.literal("notes")
    ))),
  },
  handler: async (ctx, { debtId, clear, ...fields }) => {
    if (fields.name !== undefined && (fields.name.trim().length === 0 || fields.name.length > 100)) throw new Error("El nombre debe tener entre 1 y 100 caracteres");
    if (fields.creditor !== undefined && (fields.creditor.trim().length === 0 || fields.creditor.length > 100)) throw new Error("El acreedor debe tener entre 1 y 100 caracteres");
    if (fields.interestRate !== undefined && (fields.interestRate < 0 || fields.interestRate > 1000)) throw new Error("La tasa de interés debe estar entre 0 y 1000");
    if (fields.monthlyPayment !== undefined && (fields.monthlyPayment <= 0 || !Number.isFinite(fields.monthlyPayment))) throw new Error("El pago mensual debe ser mayor que cero");
    if (fields.notes !== undefined && fields.notes.length > 500) throw new Error("Las notas no pueden superar 500 caracteres");

    const user = await getCurrentUser(ctx);
    const debt = await getOwnedDebt(ctx, user.clerkId, debtId);
    const now = Date.now();
    const patch: Record<string, unknown> = { updatedAt: now };
    for (const [k, val] of Object.entries(fields)) {
      if (val !== undefined) patch[k] = typeof val === "string" ? val.trim() : val;
    }
    for (const k of clear ?? []) patch[k] = undefined;

    // Mover o quitar la fecha límite reevalúa si sigue vencida
    if (debt.status !== "pagada" && ("dueDate" in patch)) {
      const due = patch.dueDate as number | undefined;
      patch.status = due !== undefined && due < now ? "vencida" : "activa";
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
    const debt = await getOwnedDebt(ctx, user.clerkId, args.debtId);
    if (debt.status === "pagada") throw new Error("Esta deuda ya está pagada");
    if (debt.archived) throw new Error("No se puede abonar a una deuda archivada");
    if (args.amount > debt.currentBalance) throw new Error("El abono supera el saldo pendiente");
    // Sin esto cualquier id de cuenta ajena podría debitarse
    if (args.fromAccountId) await assertCanWrite(ctx, args.fromAccountId);

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

/**
 * Borra un abono: devuelve el saldo a la deuda, revierte la cuenta y elimina el
 * movimiento. Toda la reversión vive en deleteTransactionWithEffects, la misma que
 * usa borrar el movimiento desde /transacciones.
 */
export const removePayment = mutation({
  args: { paymentId: v.id("debtPayments") },
  handler: async (ctx, { paymentId }) => {
    const user = await getCurrentUser(ctx);
    const payment = await ctx.db.get(paymentId);
    if (!payment || payment.userId !== user.clerkId) throw new Error("Abono no encontrado");
    const tx = payment.transactionId ? await ctx.db.get(payment.transactionId) : null;
    if (tx) {
      await deleteTransactionWithEffects(ctx, tx);
      return;
    }
    // Abono sin movimiento enlazado: solo se devuelve el saldo
    const debt = await getOwnedDebt(ctx, user.clerkId, payment.debtId);
    await ctx.db.patch(debt._id, {
      currentBalance: debt.currentBalance + payment.amount,
      status: reopenedStatus(debt.status, debt.dueDate),
      updatedAt: Date.now(),
    });
    await ctx.db.delete(paymentId);
  },
});

export const setArchived = mutation({
  args: { debtId: v.id("debts"), archived: v.boolean() },
  handler: async (ctx, { debtId, archived }) => {
    const user = await getCurrentUser(ctx);
    await getOwnedDebt(ctx, user.clerkId, debtId);
    await ctx.db.patch(debtId, { archived, updatedAt: Date.now() });
  },
});

/**
 * Elimina una deuda archivada con todos sus abonos: cada movimiento se revierte
 * (la cuenta recupera lo pagado) y los recurrentes que la pagaban se desactivan.
 */
export const remove = mutation({
  args: { debtId: v.id("debts") },
  handler: async (ctx, { debtId }) => {
    const user = await getCurrentUser(ctx);
    const debt = await getOwnedDebt(ctx, user.clerkId, debtId);
    if (!debt.archived) throw new Error("Solo se pueden eliminar deudas archivadas");

    const payments = await ctx.db
      .query("debtPayments")
      .withIndex("by_debt", (q) => q.eq("debtId", debtId))
      .take(1000);
    for (const p of payments) {
      const tx = p.transactionId ? await ctx.db.get(p.transactionId) : null;
      if (tx) await deleteTransactionWithEffects(ctx, tx);
      else await ctx.db.delete(p._id);
    }

    const now = Date.now();
    const recurring = await ctx.db
      .query("recurringTransactions")
      .withIndex("by_user", (q) => q.eq("userId", user.clerkId))
      .take(500);
    for (const rt of recurring) {
      if (rt.targetDebtId === debtId) {
        await ctx.db.patch(rt._id, { active: false, targetDebtId: undefined, updatedAt: now });
      }
    }

    await ctx.db.delete(debtId);
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
    return all.filter((d) => !d.archived && d.dueDate !== undefined && d.dueDate < now);
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
    return dueSoon.filter((d) => !d.archived && d.dueDate !== undefined && d.dueDate <= beforeTs);
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

/**
 * Excluir o volver a incluir en el patrimonio neto. Solo afecta a ese cálculo: el
 * resumen de este módulo sigue mostrando el saldo real, porque esconder algo del
 * sitio cuyo trabajo es vigilarlo sería peor que no poder excluirlo.
 */
export const toggleBalanceInclusion = mutation({
  args: { debtId: v.id("debts"), include: v.boolean() },
  handler: async (ctx, { debtId, include }) => {
    const user = await getCurrentUser(ctx);
    const doc = await ctx.db.get(debtId);
    if (!doc || doc.userId !== user.clerkId) throw new Error("Deuda no encontrada");
    await ctx.db.patch(debtId, { includeInBalance: include, updatedAt: Date.now() });
  },
});
