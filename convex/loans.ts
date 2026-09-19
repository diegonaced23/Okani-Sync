import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser, getCurrentUserId } from "./lib/auth";
import { assertCanWrite } from "./lib/permissions";
import { applyAccountDelta, deleteTransactionWithEffects, reopenedStatus } from "./lib/transactionEffects";
import { toMonthString } from "./lib/utils";

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

    // Crear la transacción vinculada — tipo prestamo_otorgado para excluirla del P&L
    await ctx.db.insert("transactions", {
      userId: user.clerkId,
      type: "prestamo_otorgado",
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
    /** Quitar campos opcionales */
    clear: v.optional(v.array(v.union(v.literal("dueDate"), v.literal("notes")))),
  },
  handler: async (ctx, { loanId, clear, ...fields }) => {
    if (fields.name !== undefined && (fields.name.length === 0 || fields.name.length > 100)) throw new Error("El nombre debe tener entre 1 y 100 caracteres");
    if (fields.borrower !== undefined && (fields.borrower.length === 0 || fields.borrower.length > 100)) throw new Error("El nombre de la persona debe tener entre 1 y 100 caracteres");
    if (fields.notes !== undefined && fields.notes.length > 500) throw new Error("Las notas no pueden superar 500 caracteres");

    const user = await getCurrentUser(ctx);
    const loan = await ctx.db.get(loanId);
    if (!loan || loan.userId !== user.clerkId) throw new Error("Préstamo no encontrado");

    const now = Date.now();
    const patch: Record<string, unknown> = { updatedAt: now };
    for (const [k, val] of Object.entries(fields)) {
      if (val !== undefined) patch[k] = typeof val === "string" ? val.trim() : val;
    }
    for (const k of clear ?? []) patch[k] = undefined;

    // Mover o quitar la fecha de devolución reevalúa si sigue vencido
    if (loan.status !== "pagada" && ("dueDate" in patch)) {
      const due = patch.dueDate as number | undefined;
      patch.status = due !== undefined && due < now ? "vencida" : "activa";
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
    if (args.amount > loan.currentBalance) throw new Error("El abono supera el saldo pendiente");

    if (args.toAccountId) {
      await assertCanWrite(ctx, args.toAccountId);
    }

    const paymentDate = args.date ?? Date.now();
    const month = toMonthString(paymentDate);
    const now = Date.now();

    // Crear transacción vinculada — tipo prestamo_cobrado para excluirla del P&L
    const txId = await ctx.db.insert("transactions", {
      userId: user.clerkId,
      type: "prestamo_cobrado",
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

    // Revertir y borrar los movimientos vinculados. Antes esto invertía el signo
    // solo para "ingreso", que un préstamo nunca genera: los cobros
    // (prestamo_cobrado) se sumaban otra vez a la cuenta en lugar de restarse.
    const txs = await ctx.db
      .query("transactions")
      .withIndex("by_user", (q) => q.eq("userId", user.clerkId))
      .filter((q) => q.eq(q.field("loanId"), loanId))
      .collect();
    for (const tx of txs) {
      await deleteTransactionWithEffects(ctx, tx);
    }

    // Abonos que quedaran sin movimiento enlazado
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

/** Borra un abono recibido: el préstamo vuelve a deber ese monto y la cuenta se revierte. */
export const removeRepayment = mutation({
  args: { repaymentId: v.id("loanRepayments") },
  handler: async (ctx, { repaymentId }) => {
    const user = await getCurrentUser(ctx);
    const repayment = await ctx.db.get(repaymentId);
    if (!repayment || repayment.userId !== user.clerkId) throw new Error("Abono no encontrado");
    const tx = repayment.transactionId ? await ctx.db.get(repayment.transactionId) : null;
    if (tx) {
      await deleteTransactionWithEffects(ctx, tx);
      return;
    }
    const loan = await ctx.db.get(repayment.loanId);
    if (loan) {
      await ctx.db.patch(loan._id, {
        currentBalance: loan.currentBalance + repayment.amount,
        status: reopenedStatus(loan.status, loan.dueDate),
        updatedAt: Date.now(),
      });
    }
    await ctx.db.delete(repaymentId);
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
    return all.filter((l) => !l.archived && l.dueDate !== undefined && l.dueDate < now);
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
    return dueSoon.filter((l) => !l.archived && l.dueDate !== undefined && l.dueDate <= beforeTs);
  },
});

export const markOverdueInternal = internalMutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    await ctx.db.patch(loanId, { status: "vencida", updatedAt: Date.now() });
  },
});
