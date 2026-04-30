import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getCurrentUser, getCurrentUserId } from "./lib/auth";
import { calculateInstallment, addMonths } from "./lib/money";
import { toMonthString } from "./lib/utils";

// ─── Helper: actualizar saldo de cuenta ──────────────────────────────────────

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

export const listByCard = query({
  args: {
    cardId: v.id("cards"),
    status: v.optional(
      v.union(v.literal("activa"), v.literal("pagada"), v.literal("cancelada"))
    ),
  },
  handler: async (ctx, { cardId, status }) => {
    const clerkId = await getCurrentUserId(ctx);
    const card = await ctx.db.get(cardId);
    if (!card || card.userId !== clerkId) return [];

    const q = ctx.db
      .query("cardPurchases")
      .withIndex("by_card", (q) => q.eq("cardId", cardId));

    if (status) {
      return (await q.collect()).filter((p) => p.status === status);
    }
    return q.collect();
  },
});

export const listActiveByUser = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await getCurrentUserId(ctx);
    return await ctx.db
      .query("cardPurchases")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", clerkId).eq("status", "activa")
      )
      .collect();
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

export const createPurchase = mutation({
  args: {
    cardId: v.id("cards"),
    categoryId: v.optional(v.id("categories")),
    description: v.string(),
    totalAmount: v.number(),        // en centavos
    totalInstallments: v.number(),
    hasInterest: v.boolean(),
    interestRate: v.optional(v.number()), // decimal, ej: 0.08
    purchaseDate: v.number(),
    firstInstallmentDate: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    const card = await ctx.db.get(args.cardId);
    if (!card || card.userId !== user.clerkId) {
      throw new Error("Tarjeta no encontrada");
    }

    const rate = args.hasInterest ? (args.interestRate ?? 0) : 0;
    const result = calculateInstallment(args.totalAmount, rate, args.totalInstallments);

    const now = Date.now();

    const purchaseId = await ctx.db.insert("cardPurchases", {
      userId: user.clerkId,
      cardId: args.cardId,
      categoryId: args.categoryId,
      description: args.description,
      totalAmount: args.totalAmount,
      totalWithInterest: result.totalWithInterest,
      totalInstallments: args.totalInstallments,
      paidInstallments: 0,
      amountPerInstallment: result.amountPerInstallment,
      hasInterest: args.hasInterest,
      interestRate: args.hasInterest ? args.interestRate : undefined,
      totalInterest: result.totalInterest,
      currency: card.currency,
      purchaseDate: args.purchaseDate,
      firstInstallmentDate: args.firstInstallmentDate,
      status: "activa",
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });

    // Generar cronograma de cuotas
    for (const item of result.schedule) {
      const dueDate = addMonths(args.firstInstallmentDate, item.installmentNumber - 1);
      await ctx.db.insert("cardInstallments", {
        userId: user.clerkId,
        purchaseId,
        cardId: args.cardId,
        installmentNumber: item.installmentNumber,
        amount: item.amount,
        principalAmount: item.principalAmount,
        interestAmount: item.interestAmount,
        remainingPrincipal: item.remainingPrincipal,
        dueDate,
        month: toMonthString(dueDate),
        paid: false,
        createdAt: now,
      });
    }

    // Actualizar saldo y cupo de la tarjeta
    const newBalance = card.currentBalance + result.totalWithInterest;
    await ctx.db.patch(args.cardId, {
      currentBalance: newBalance,
      availableCredit: Math.max(0, card.creditLimit - newBalance),
      updatedAt: now,
    });

    return purchaseId;
  },
});

export const payInstallment = mutation({
  args: {
    installmentId: v.id("cardInstallments"),
    fromAccountId: v.optional(v.id("accounts")), // cuenta desde donde se paga
    paymentDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    const installment = await ctx.db.get(args.installmentId);
    if (!installment || installment.userId !== user.clerkId) {
      throw new Error("Cuota no encontrada");
    }
    if (installment.paid) {
      throw new Error("Esta cuota ya fue pagada");
    }

    const purchase = await ctx.db.get(installment.purchaseId);
    if (!purchase) throw new Error("Compra no encontrada");

    const card = await ctx.db.get(installment.cardId);
    if (!card) throw new Error("Tarjeta no encontrada");

    const paymentDate = args.paymentDate ?? Date.now();
    const month = toMonthString(paymentDate);
    const now = Date.now();

    // Crear transacción de pago
    const txId = await ctx.db.insert("transactions", {
      userId: user.clerkId,
      type: "pago_tarjeta",
      amount: installment.amount,
      description: `Cuota ${installment.installmentNumber}/${purchase.totalInstallments} — ${purchase.description}`,
      date: paymentDate,
      month,
      currency: card.currency,
      accountId: args.fromAccountId,
      cardId: installment.cardId,
      cardInstallmentId: installment._id,
      cardPurchaseId: installment.purchaseId,
      status: "completada",
      isRecurring: false,
      createdAt: now,
      updatedAt: now,
    });

    // Marcar cuota como pagada
    await ctx.db.patch(args.installmentId, {
      paid: true,
      paidAt: now,
      transactionId: txId,
    });

    // Actualizar compra
    const newPaidCount = purchase.paidInstallments + 1;
    const fullyPaid = newPaidCount >= purchase.totalInstallments;
    await ctx.db.patch(installment.purchaseId, {
      paidInstallments: newPaidCount,
      status: fullyPaid ? "pagada" : "activa",
      updatedAt: now,
    });

    // Reducir deuda de la tarjeta
    const newBalance = Math.max(0, card.currentBalance - installment.amount);
    await ctx.db.patch(installment.cardId, {
      currentBalance: newBalance,
      availableCredit: Math.min(card.creditLimit, card.availableCredit + installment.amount),
      updatedAt: now,
    });

    // Descontar de la cuenta de origen si se especificó
    if (args.fromAccountId) {
      await applyAccountDelta(ctx, args.fromAccountId, -installment.amount);
    }

    return txId;
  },
});
