import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getCurrentUser, getCurrentUserId } from "./lib/auth";
import { calculateInstallment, addMonths } from "./lib/money";
import { toMonthString } from "./lib/utils";

// ─── Helpers locales ─────────────────────────────────────────────────────────

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

    // Generar cronograma de cuotas + tx gasto_tarjeta por cada una
    for (const item of result.schedule) {
      const dueDate = addMonths(args.firstInstallmentDate, item.installmentNumber - 1);
      const instMonth = toMonthString(dueDate);

      const installmentId = await ctx.db.insert("cardInstallments", {
        userId: user.clerkId,
        purchaseId,
        cardId: args.cardId,
        installmentNumber: item.installmentNumber,
        amount: item.amount,
        principalAmount: item.principalAmount,
        interestAmount: item.interestAmount,
        remainingPrincipal: item.remainingPrincipal,
        dueDate,
        month: instMonth,
        paid: false,
        createdAt: now,
      });

      const desc = args.totalInstallments > 1
        ? `${args.description} — Cuota ${item.installmentNumber}/${args.totalInstallments}`
        : args.description;

      // Crear movimiento visible en el módulo de Movimientos (no descuenta cuenta)
      await ctx.db.insert("transactions", {
        userId: user.clerkId,
        type: "gasto_tarjeta",
        amount: item.amount,
        description: desc,
        date: dueDate,
        month: instMonth,
        currency: card.currency,
        cardId: args.cardId,
        cardInstallmentId: installmentId,
        cardPurchaseId: purchaseId,
        categoryId: args.categoryId,
        status: "completada",
        isRecurring: false,
        createdAt: now,
        updatedAt: now,
      });

      // Actualizar presupuesto de la categoría en el mes de la cuota
      if (args.categoryId) {
        await applyBudgetDelta(ctx, user.clerkId, args.categoryId, instMonth, item.amount);
      }
    }

    // Actualizar saldo y cupo de la tarjeta (aumenta la deuda)
    const newBalance = card.currentBalance + result.totalWithInterest;
    await ctx.db.patch(args.cardId, {
      currentBalance: newBalance,
      availableCredit: Math.max(0, card.creditLimit - newBalance),
      updatedAt: now,
    });

    return purchaseId;
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
      const finalCategoryId = clearCategory ? undefined : (fields.categoryId ?? purchase.categoryId);

      const result = calculateInstallment(totalAmount, interestRate, totalInstallments);

      const oldInstallments = await ctx.db
        .query("cardInstallments")
        .withIndex("by_purchase", (q) => q.eq("purchaseId", purchaseId))
        .collect();

      // Revertir presupuesto y eliminar txs gasto_tarjeta de cuotas anteriores
      for (const inst of oldInstallments) {
        if (purchase.categoryId) {
          await applyBudgetDelta(ctx, user.clerkId, purchase.categoryId, inst.month, -inst.amount);
        }
        // Buscar y eliminar la tx gasto_tarjeta asociada a esta cuota
        const oldTxs = await ctx.db
          .query("transactions")
          .withIndex("by_card", (q) => q.eq("cardId", purchase.cardId))
          .filter((q) => q.eq(q.field("cardInstallmentId"), inst._id))
          .collect();
        for (const tx of oldTxs) await ctx.db.delete(tx._id);
        await ctx.db.delete(inst._id);
      }

      // Generar nuevas cuotas + txs gasto_tarjeta
      for (const item of result.schedule) {
        const dueDate = addMonths(firstInstallmentDate, item.installmentNumber - 1);
        const instMonth = toMonthString(dueDate);

        const installmentId = await ctx.db.insert("cardInstallments", {
          userId: user.clerkId,
          purchaseId,
          cardId: purchase.cardId,
          installmentNumber: item.installmentNumber,
          amount: item.amount,
          principalAmount: item.principalAmount,
          interestAmount: item.interestAmount,
          remainingPrincipal: item.remainingPrincipal,
          dueDate,
          month: instMonth,
          paid: false,
          createdAt: now,
        });

        const desc = totalInstallments > 1
          ? `${fields.description?.trim() ?? purchase.description} — Cuota ${item.installmentNumber}/${totalInstallments}`
          : (fields.description?.trim() ?? purchase.description);

        await ctx.db.insert("transactions", {
          userId: user.clerkId,
          type: "gasto_tarjeta",
          amount: item.amount,
          description: desc,
          date: dueDate,
          month: instMonth,
          currency: purchase.currency,
          cardId: purchase.cardId,
          cardInstallmentId: installmentId,
          cardPurchaseId: purchaseId,
          categoryId: finalCategoryId,
          status: "completada",
          isRecurring: false,
          createdAt: now,
          updatedAt: now,
        });

        if (finalCategoryId) {
          await applyBudgetDelta(ctx, user.clerkId, finalCategoryId, instMonth, item.amount);
        }
      }

      // Ajustar saldo de la tarjeta por la diferencia
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
        categoryId: finalCategoryId,
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

      // Si cambió la categoría, rotar el presupuesto a la nueva y actualizar txs
      const categoryChanged = clearCategory || (fields.categoryId !== undefined && fields.categoryId !== purchase.categoryId);
      if (categoryChanged) {
        const installments = await ctx.db
          .query("cardInstallments")
          .withIndex("by_purchase", (q) => q.eq("purchaseId", purchaseId))
          .collect();

        const newCatId = clearCategory ? undefined : fields.categoryId;

        for (const inst of installments) {
          if (purchase.categoryId) {
            await applyBudgetDelta(ctx, user.clerkId, purchase.categoryId, inst.month, -inst.amount);
          }
          if (newCatId) {
            await applyBudgetDelta(ctx, user.clerkId, newCatId, inst.month, inst.amount);
          }
          // Actualizar categoryId en las txs gasto_tarjeta
          const txs = await ctx.db
            .query("transactions")
            .withIndex("by_card", (q) => q.eq("cardId", purchase.cardId))
            .filter((q) => q.eq(q.field("cardInstallmentId"), inst._id))
            .collect();
          for (const tx of txs) {
            await ctx.db.patch(tx._id, { categoryId: newCatId, updatedAt: now });
          }
        }
      }

      // Si cambió la descripción (sin cambio financiero), actualizar txs gasto_tarjeta
      if (fields.description !== undefined) {
        const installments = await ctx.db
          .query("cardInstallments")
          .withIndex("by_purchase", (q) => q.eq("purchaseId", purchaseId))
          .collect();
        for (const inst of installments) {
          const desc = purchase.totalInstallments > 1
            ? `${fields.description.trim()} — Cuota ${inst.installmentNumber}/${purchase.totalInstallments}`
            : fields.description.trim();
          const txs = await ctx.db
            .query("transactions")
            .withIndex("by_card", (q) => q.eq("cardId", purchase.cardId))
            .filter((q) => q.eq(q.field("cardInstallmentId"), inst._id))
            .collect();
          for (const tx of txs) {
            await ctx.db.patch(tx._id, { description: desc, updatedAt: now });
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

    const unpaidDebt = installments
      .filter((i) => !i.paid)
      .reduce((sum, i) => sum + i.amount, 0);

    // Revertir presupuesto y eliminar txs gasto_tarjeta de cada cuota
    for (const inst of installments) {
      if (purchase.categoryId) {
        await applyBudgetDelta(ctx, user.clerkId, purchase.categoryId, inst.month, -inst.amount);
      }
      const txs = await ctx.db
        .query("transactions")
        .withIndex("by_card", (q) => q.eq("cardId", purchase.cardId))
        .filter((q) => q.eq(q.field("cardInstallmentId"), inst._id))
        .collect();
      for (const tx of txs) await ctx.db.delete(tx._id);
      await ctx.db.delete(inst._id);
    }

    // Reducir deuda de la tarjeta por las cuotas no pagadas (las pagadas ya redujeron la deuda)
    const card = await ctx.db.get(purchase.cardId);
    if (card) {
      const newBalance = Math.max(0, card.currentBalance - unpaidDebt);
      await ctx.db.patch(purchase.cardId, {
        currentBalance: newBalance,
        availableCredit: card.creditLimit - newBalance,
        updatedAt: Date.now(),
      });
    }

    await ctx.db.delete(purchaseId);
  },
});

/**
 * Crea una compra de 1 cuota desde una transacción recurrente (sin auth check).
 * Equivale a createPurchase con totalInstallments=1, llamada internamente por el procesador de recurrentes.
 */
export const createFromRecurring = internalMutation({
  args: {
    userId: v.string(),
    cardId: v.id("cards"),
    categoryId: v.optional(v.id("categories")),
    description: v.string(),
    amount: v.number(),
    date: v.number(),
    recurringId: v.optional(v.id("recurringTransactions")),
  },
  handler: async (ctx, args) => {
    const card = await ctx.db.get(args.cardId);
    if (!card || card.userId !== args.userId) return;

    const month = toMonthString(args.date);
    const now = Date.now();

    const purchaseId = await ctx.db.insert("cardPurchases", {
      userId: args.userId,
      cardId: args.cardId,
      categoryId: args.categoryId,
      description: args.description,
      totalAmount: args.amount,
      totalWithInterest: args.amount,
      totalInstallments: 1,
      paidInstallments: 0,
      amountPerInstallment: args.amount,
      hasInterest: false,
      totalInterest: 0,
      currency: card.currency,
      purchaseDate: args.date,
      firstInstallmentDate: args.date,
      status: "activa",
      createdAt: now,
      updatedAt: now,
    });

    const installmentId = await ctx.db.insert("cardInstallments", {
      userId: args.userId,
      purchaseId,
      cardId: args.cardId,
      installmentNumber: 1,
      amount: args.amount,
      principalAmount: args.amount,
      interestAmount: 0,
      remainingPrincipal: 0,
      dueDate: args.date,
      month,
      paid: false,
      createdAt: now,
    });

    await ctx.db.insert("transactions", {
      userId: args.userId,
      type: "gasto_tarjeta",
      amount: args.amount,
      description: args.description,
      date: args.date,
      month,
      currency: card.currency,
      cardId: args.cardId,
      cardInstallmentId: installmentId,
      cardPurchaseId: purchaseId,
      categoryId: args.categoryId,
      status: "completada",
      isRecurring: true,
      recurringId: args.recurringId,
      createdAt: now,
      updatedAt: now,
    });

    if (args.categoryId) {
      await applyBudgetDelta(ctx, args.userId, args.categoryId, month, args.amount);
    }

    const newBalance = card.currentBalance + args.amount;
    await ctx.db.patch(args.cardId, {
      currentBalance: newBalance,
      availableCredit: Math.max(0, card.creditLimit - newBalance),
      updatedAt: now,
    });
  },
});
