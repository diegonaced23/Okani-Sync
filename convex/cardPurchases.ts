import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getCurrentUser, getCurrentUserId } from "./lib/auth";
import { calculateInstallment, addMonths } from "./lib/money";
import { toMonthString } from "./lib/utils";

// ─── Helper: actualizar presupuesto de categoría ─────────────────────────────

async function applyBudgetDelta(
  ctx: MutationCtx,
  userId: string,
  categoryId: Id<"categories">,
  month: string,
  delta: number
) {
  const budget = await ctx.db
    .query("budgets")
    .withIndex("by_user_category_month", (q) =>
      q.eq("userId", userId).eq("categoryId", categoryId).eq("month", month)
    )
    .unique();
  if (!budget) return;
  await ctx.db.patch(budget._id, {
    spent: Math.max(0, budget.spent + delta),
    updatedAt: Date.now(),
  });
}

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

    // Cargar presupuesto: cada cuota en su mes correspondiente
    if (args.categoryId) {
      for (const item of result.schedule) {
        const instMonth = toMonthString(addMonths(args.firstInstallmentDate, item.installmentNumber - 1));
        await applyBudgetDelta(ctx, user.clerkId, args.categoryId, instMonth, item.amount);
      }
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
      categoryId: purchase.categoryId,
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

export const updatePurchase = mutation({
  args: {
    purchaseId: v.id("cardPurchases"),
    description: v.optional(v.string()),
    categoryId: v.optional(v.id("categories")),
    clearCategory: v.optional(v.boolean()),
    notes: v.optional(v.string()),
    // Financieros — solo cuando paidInstallments === 0
    totalAmount: v.optional(v.number()),
    totalInstallments: v.optional(v.number()),
    hasInterest: v.optional(v.boolean()),
    interestRate: v.optional(v.number()),
    purchaseDate: v.optional(v.number()),
    firstInstallmentDate: v.optional(v.number()),
  },
  handler: async (ctx, { purchaseId, clearCategory, ...fields }) => {
    const user = await getCurrentUser(ctx);

    const purchase = await ctx.db.get(purchaseId);
    if (!purchase || purchase.userId !== user.clerkId) {
      throw new Error("Compra no encontrada");
    }

    const now = Date.now();

    const financialChanged =
      (fields.totalAmount !== undefined && fields.totalAmount !== purchase.totalAmount) ||
      (fields.totalInstallments !== undefined && fields.totalInstallments !== purchase.totalInstallments) ||
      (fields.hasInterest !== undefined && fields.hasInterest !== purchase.hasInterest) ||
      (fields.firstInstallmentDate !== undefined && fields.firstInstallmentDate !== purchase.firstInstallmentDate) ||
      (fields.interestRate !== undefined &&
        Math.abs(fields.interestRate - (purchase.interestRate ?? 0)) > 0.00001);

    if (financialChanged && purchase.paidInstallments > 0) {
      throw new Error(
        "No se pueden modificar los datos financieros cuando ya hay cuotas pagadas"
      );
    }

    if (financialChanged) {
      const totalAmount = fields.totalAmount ?? purchase.totalAmount;
      const totalInstallments = fields.totalInstallments ?? purchase.totalInstallments;
      const hasInterest = fields.hasInterest ?? purchase.hasInterest;
      const interestRate = hasInterest ? (fields.interestRate ?? purchase.interestRate ?? 0) : 0;
      const firstInstallmentDate = fields.firstInstallmentDate ?? purchase.firstInstallmentDate;

      const result = calculateInstallment(totalAmount, interestRate, totalInstallments);

      const oldInstallments = await ctx.db
        .query("cardInstallments")
        .withIndex("by_purchase", (q) => q.eq("purchaseId", purchaseId))
        .collect();

      // Revertir presupuesto de cuotas anteriores
      if (purchase.categoryId) {
        for (const inst of oldInstallments) {
          await applyBudgetDelta(ctx, user.clerkId, purchase.categoryId, inst.month, -inst.amount);
        }
      }

      await Promise.all(oldInstallments.map((i) => ctx.db.delete(i._id)));

      for (const item of result.schedule) {
        const dueDate = addMonths(firstInstallmentDate, item.installmentNumber - 1);
        await ctx.db.insert("cardInstallments", {
          userId: user.clerkId,
          purchaseId,
          cardId: purchase.cardId,
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

      // Aplicar presupuesto de nuevas cuotas con la categoría final
      const finalCategoryId = clearCategory ? undefined : (fields.categoryId ?? purchase.categoryId);
      if (finalCategoryId) {
        for (const item of result.schedule) {
          const instMonth = toMonthString(addMonths(firstInstallmentDate, item.installmentNumber - 1));
          await applyBudgetDelta(ctx, user.clerkId, finalCategoryId, instMonth, item.amount);
        }
      }

      const card = await ctx.db.get(purchase.cardId);
      if (card) {
        const diff = result.totalWithInterest - purchase.totalWithInterest;
        const newBalance = Math.max(0, card.currentBalance + diff);
        await ctx.db.patch(purchase.cardId, {
          currentBalance: newBalance,
          availableCredit: Math.max(0, card.creditLimit - newBalance),
          updatedAt: now,
        });
      }

      await ctx.db.patch(purchaseId, {
        description: fields.description?.trim() ?? purchase.description,
        categoryId: clearCategory ? undefined : (fields.categoryId ?? purchase.categoryId),
        notes: fields.notes !== undefined ? fields.notes : purchase.notes,
        totalAmount,
        totalWithInterest: result.totalWithInterest,
        totalInstallments,
        paidInstallments: 0,
        amountPerInstallment: result.amountPerInstallment,
        hasInterest,
        interestRate: hasInterest ? interestRate : undefined,
        totalInterest: result.totalInterest,
        purchaseDate: fields.purchaseDate ?? purchase.purchaseDate,
        firstInstallmentDate,
        updatedAt: now,
      });
    } else {
      const patch: Record<string, unknown> = { updatedAt: now };
      if (fields.description !== undefined) patch.description = fields.description.trim();
      if (clearCategory) patch.categoryId = undefined;
      else if (fields.categoryId !== undefined) patch.categoryId = fields.categoryId;
      if (fields.notes !== undefined) patch.notes = fields.notes;
      await ctx.db.patch(purchaseId, patch);

      // Si cambió la categoría, rotar el presupuesto a la nueva
      const categoryChanged = clearCategory || (fields.categoryId !== undefined && fields.categoryId !== purchase.categoryId);
      if (categoryChanged && (purchase.categoryId || (!clearCategory && fields.categoryId))) {
        const installments = await ctx.db
          .query("cardInstallments")
          .withIndex("by_purchase", (q) => q.eq("purchaseId", purchaseId))
          .collect();
        if (purchase.categoryId) {
          for (const inst of installments) {
            await applyBudgetDelta(ctx, user.clerkId, purchase.categoryId, inst.month, -inst.amount);
          }
        }
        const newCatId = clearCategory ? undefined : fields.categoryId;
        if (newCatId) {
          for (const inst of installments) {
            await applyBudgetDelta(ctx, user.clerkId, newCatId, inst.month, inst.amount);
          }
        }
      }
    }
  },
});

export const deletePurchase = mutation({
  args: { purchaseId: v.id("cardPurchases") },
  handler: async (ctx, { purchaseId }) => {
    const user = await getCurrentUser(ctx);

    const purchase = await ctx.db.get(purchaseId);
    if (!purchase || purchase.userId !== user.clerkId) {
      throw new Error("Compra no encontrada");
    }

    const installments = await ctx.db
      .query("cardInstallments")
      .withIndex("by_purchase", (q) => q.eq("purchaseId", purchaseId))
      .collect();

    const remainingDebt = installments
      .filter((i) => !i.paid)
      .reduce((sum, i) => sum + i.amount, 0);

    // Revertir presupuesto de todas las cuotas (se cargaron al crear)
    if (purchase.categoryId) {
      for (const inst of installments) {
        await applyBudgetDelta(ctx, user.clerkId, purchase.categoryId, inst.month, -inst.amount);
      }
    }

    await Promise.all(installments.map((i) => ctx.db.delete(i._id)));

    const card = await ctx.db.get(purchase.cardId);
    if (card) {
      const newBalance = Math.max(0, card.currentBalance - remainingDebt);
      await ctx.db.patch(purchase.cardId, {
        currentBalance: newBalance,
        availableCredit: card.creditLimit - newBalance,
        updatedAt: Date.now(),
      });
    }

    await ctx.db.delete(purchaseId);
  },
});

export const payMinimum = mutation({
  args: {
    cardId: v.id("cards"),
    fromAccountId: v.id("accounts"),
    paymentDate: v.optional(v.number()),
    targetMonth: v.optional(v.string()), // "YYYY-MM"; por defecto el mes actual
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    const card = await ctx.db.get(args.cardId);
    if (!card || card.userId !== user.clerkId) throw new Error("Tarjeta no encontrada");

    const account = await ctx.db.get(args.fromAccountId);
    if (!account) throw new Error("Cuenta no encontrada");
    if (account.currency !== card.currency) {
      throw new Error(`La cuenta usa ${account.currency} pero la tarjeta es en ${card.currency}`);
    }

    const paymentDate = args.paymentDate ?? Date.now();
    const targetMonth = args.targetMonth ?? toMonthString(Date.now());
    const now = Date.now();

    const monthInstallments = await ctx.db
      .query("cardInstallments")
      .withIndex("by_card_month", (q) =>
        q.eq("cardId", args.cardId).eq("month", targetMonth)
      )
      .collect();

    const unpaid = monthInstallments.filter((i) => !i.paid);
    if (unpaid.length === 0) throw new Error("No hay cuotas pendientes este mes");

    let totalAmount = 0;

    for (const inst of unpaid) {
      const purchase = await ctx.db.get(inst.purchaseId);
      if (!purchase) continue;

      const txId = await ctx.db.insert("transactions", {
        userId: user.clerkId,
        type: "pago_tarjeta",
        amount: inst.amount,
        description: `Cuota ${inst.installmentNumber}/${purchase.totalInstallments} — ${purchase.description}`,
        date: paymentDate,
        month: toMonthString(paymentDate),
        currency: card.currency,
        accountId: args.fromAccountId,
        cardId: args.cardId,
        cardInstallmentId: inst._id,
        cardPurchaseId: inst.purchaseId,
        categoryId: purchase.categoryId,
        status: "completada",
        isRecurring: false,
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.patch(inst._id, { paid: true, paidAt: now, transactionId: txId });

      const newPaidCount = purchase.paidInstallments + 1;
      await ctx.db.patch(inst.purchaseId, {
        paidInstallments: newPaidCount,
        status: newPaidCount >= purchase.totalInstallments ? "pagada" : "activa",
        updatedAt: now,
      });

      totalAmount += inst.amount;
    }

    const newBalance = Math.max(0, card.currentBalance - totalAmount);
    await ctx.db.patch(args.cardId, {
      currentBalance: newBalance,
      availableCredit: Math.min(card.creditLimit, card.availableCredit + totalAmount),
      updatedAt: now,
    });

    await ctx.db.patch(args.fromAccountId, {
      balance: account.balance - totalAmount,
      updatedAt: now,
    });

    return { paidCount: unpaid.length, totalAmount };
  },
});

export const payTotal = mutation({
  args: {
    cardId: v.id("cards"),
    fromAccountId: v.id("accounts"),
    paymentDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    const card = await ctx.db.get(args.cardId);
    if (!card || card.userId !== user.clerkId) throw new Error("Tarjeta no encontrada");

    const account = await ctx.db.get(args.fromAccountId);
    if (!account) throw new Error("Cuenta no encontrada");
    if (account.currency !== card.currency) {
      throw new Error(`La cuenta usa ${account.currency} pero la tarjeta es en ${card.currency}`);
    }

    if (card.currentBalance <= 0) throw new Error("La tarjeta no tiene deuda pendiente");

    const totalAmount = card.currentBalance;
    const paymentDate = args.paymentDate ?? Date.now();
    const now = Date.now();

    // Todas las cuotas no pagadas de esta tarjeta
    const allUnpaid = await ctx.db
      .query("cardInstallments")
      .withIndex("by_user_paid", (q) =>
        q.eq("userId", user.clerkId).eq("paid", false)
      )
      .collect();
    const unpaidForCard = allUnpaid.filter((i) => i.cardId === args.cardId);

    // Agrupar por compra para actualizar paidInstallments en una sola pasada
    const purchaseMap = new Map<
      Id<"cardPurchases">,
      { paidInstallments: number; totalInstallments: number; description: string; categoryId: Id<"categories"> | undefined; installments: typeof unpaidForCard }
    >();

    for (const inst of unpaidForCard) {
      if (!purchaseMap.has(inst.purchaseId)) {
        const purchase = await ctx.db.get(inst.purchaseId);
        if (!purchase) continue;
        purchaseMap.set(inst.purchaseId, {
          paidInstallments: purchase.paidInstallments,
          totalInstallments: purchase.totalInstallments,
          description: purchase.description,
          categoryId: purchase.categoryId,
          installments: [],
        });
      }
      purchaseMap.get(inst.purchaseId)!.installments.push(inst);
    }

    let installmentSum = 0;

    for (const [purchaseId, entry] of purchaseMap) {
      for (const inst of entry.installments) {
        const txId = await ctx.db.insert("transactions", {
          userId: user.clerkId,
          type: "pago_tarjeta",
          amount: inst.amount,
          description: `Cuota ${inst.installmentNumber}/${entry.totalInstallments} — ${entry.description}`,
          date: paymentDate,
          month: toMonthString(paymentDate),
          currency: card.currency,
          accountId: args.fromAccountId,
          cardId: args.cardId,
          cardInstallmentId: inst._id,
          cardPurchaseId: purchaseId,
          categoryId: entry.categoryId,
          status: "completada",
          isRecurring: false,
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.patch(inst._id, { paid: true, paidAt: now, transactionId: txId });
        installmentSum += inst.amount;
      }

      const newPaidCount = entry.paidInstallments + entry.installments.length;
      await ctx.db.patch(purchaseId, {
        paidInstallments: newPaidCount,
        status: newPaidCount >= entry.totalInstallments ? "pagada" : "activa",
        updatedAt: now,
      });
    }

    // Gastos directos: parte del saldo no cubierta por cuotas
    const directExpenseTotal = totalAmount - installmentSum;
    if (directExpenseTotal > 0) {
      await ctx.db.insert("transactions", {
        userId: user.clerkId,
        type: "pago_tarjeta",
        amount: directExpenseTotal,
        description: "Pago de gastos directos",
        date: paymentDate,
        month: toMonthString(paymentDate),
        currency: card.currency,
        accountId: args.fromAccountId,
        cardId: args.cardId,
        status: "completada",
        isRecurring: false,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(args.cardId, {
      currentBalance: 0,
      availableCredit: card.creditLimit,
      updatedAt: now,
    });

    await ctx.db.patch(args.fromAccountId, {
      balance: account.balance - totalAmount,
      updatedAt: now,
    });

    return { paidCount: unpaidForCard.length, totalAmount };
  },
});
