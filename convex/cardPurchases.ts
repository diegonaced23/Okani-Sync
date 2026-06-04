import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getCurrentUser, getCurrentUserId } from "./lib/auth";
import { calculateInstallment, addMonths } from "./lib/money";
import { toMonthString, getSystemInterestsCategoryId } from "./lib/utils";
import { applyBudgetDelta } from "./lib/transactionEffects";

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

/** Compras cuya purchaseDate cae en el mes indicado (para mostrar el registro padre en la lista). */
export const listByPurchaseMonth = query({
  args: { month: v.string() },
  handler: async (ctx, { month }) => {
    const clerkId = await getCurrentUserId(ctx);
    const all = await ctx.db
      .query("cardPurchases")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", clerkId).eq("status", "activa")
      )
      .collect();
    return all.filter((p) => toMonthString(p.purchaseDate) === month);
  },
});

/** Retorna una compra con su cronograma de cuotas — para el modal de detalle. */
export const getWithInstallments = query({
  args: { purchaseId: v.id("cardPurchases") },
  handler: async (ctx, { purchaseId }) => {
    const clerkId = await getCurrentUserId(ctx);
    const purchase = await ctx.db.get(purchaseId);
    if (!purchase || purchase.userId !== clerkId) return null;

    const installments = await ctx.db
      .query("cardInstallments")
      .withIndex("by_purchase", (q) => q.eq("purchaseId", purchaseId))
      .collect();

    installments.sort((a, b) => a.installmentNumber - b.installmentNumber);

    const card = await ctx.db.get(purchase.cardId);

    return { purchase, installments, card };
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

    // Resolver categoría de intereses una vez antes del bucle
    const interestsCatId = args.hasInterest
      ? await getSystemInterestsCategoryId(ctx, user.clerkId)
      : undefined;

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

      // Presupuesto: principal → categoría del gasto, interés → "Gastos financieros"
      if (args.categoryId) {
        const principalBudget = interestsCatId ? item.principalAmount : item.amount;
        await applyBudgetDelta(ctx, user.clerkId, args.categoryId, instMonth, principalBudget, card.currency);
      }
      if (interestsCatId && item.interestAmount > 0) {
        await applyBudgetDelta(ctx, user.clerkId, interestsCatId, instMonth, item.interestAmount, card.currency);
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

      const updateInterestsCatId = hasInterest
        ? await getSystemInterestsCategoryId(ctx, user.clerkId)
        : undefined;

      // Revertir presupuesto y eliminar txs gasto_tarjeta de cuotas anteriores.
      // Usa split principal/interés para revertir correctamente compras post-2.5.
      for (const inst of oldInstallments) {
        if (purchase.categoryId) {
          const principalToRevert = updateInterestsCatId ? (inst.principalAmount ?? inst.amount) : inst.amount;
          await applyBudgetDelta(ctx, user.clerkId, purchase.categoryId, inst.month, -principalToRevert, purchase.currency);
        }
        if (updateInterestsCatId && (inst.interestAmount ?? 0) > 0) {
          await applyBudgetDelta(ctx, user.clerkId, updateInterestsCatId, inst.month, -(inst.interestAmount!), purchase.currency);
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

      // Generar nuevas cuotas + txs gasto_tarjeta con split de presupuesto
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
          const principalBudget = updateInterestsCatId ? item.principalAmount : item.amount;
          await applyBudgetDelta(ctx, user.clerkId, finalCategoryId, instMonth, principalBudget, purchase.currency);
        }
        if (updateInterestsCatId && item.interestAmount > 0) {
          await applyBudgetDelta(ctx, user.clerkId, updateInterestsCatId, instMonth, item.interestAmount, purchase.currency);
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
        const rotateCatInterestsCatId = purchase.hasInterest
          ? await getSystemInterestsCategoryId(ctx, user.clerkId)
          : undefined;

        for (const inst of installments) {
          if (purchase.categoryId) {
            const principalToRevert = rotateCatInterestsCatId ? (inst.principalAmount ?? inst.amount) : inst.amount;
            await applyBudgetDelta(ctx, user.clerkId, purchase.categoryId, inst.month, -principalToRevert, purchase.currency);
          }
          if (rotateCatInterestsCatId && (inst.interestAmount ?? 0) > 0) {
            await applyBudgetDelta(ctx, user.clerkId, rotateCatInterestsCatId, inst.month, -(inst.interestAmount!), purchase.currency);
          }
          if (newCatId) {
            const principalToApply = rotateCatInterestsCatId ? (inst.principalAmount ?? inst.amount) : inst.amount;
            await applyBudgetDelta(ctx, user.clerkId, newCatId, inst.month, principalToApply, purchase.currency);
          }
          if (rotateCatInterestsCatId && newCatId && (inst.interestAmount ?? 0) > 0) {
            await applyBudgetDelta(ctx, user.clerkId, rotateCatInterestsCatId, inst.month, inst.interestAmount!, purchase.currency);
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

    const deleteInterestsCatId = purchase.hasInterest
      ? await getSystemInterestsCategoryId(ctx, user.clerkId)
      : undefined;

    // Revertir presupuesto con split principal/interés y eliminar txs gasto_tarjeta
    for (const inst of installments) {
      if (purchase.categoryId) {
        const principalToRevert = deleteInterestsCatId ? (inst.principalAmount ?? inst.amount) : inst.amount;
        await applyBudgetDelta(ctx, user.clerkId, purchase.categoryId, inst.month, -principalToRevert, purchase.currency);
      }
      if (deleteInterestsCatId && (inst.interestAmount ?? 0) > 0) {
        await applyBudgetDelta(ctx, user.clerkId, deleteInterestsCatId, inst.month, -(inst.interestAmount!), purchase.currency);
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
      await applyBudgetDelta(ctx, args.userId, args.categoryId, month, args.amount, card.currency);
    }

    const newBalance = card.currentBalance + args.amount;
    await ctx.db.patch(args.cardId, {
      currentBalance: newBalance,
      availableCredit: Math.max(0, card.creditLimit - newBalance),
      updatedAt: now,
    });
  },
});

/**
 * Interna: crea la compra recurrente con tarjeta Y avanza nextOccurrence en una sola
 * mutación atómica, eliminando la ventana de fallo entre ambas operaciones.
 */
export const processRecurringCardOccurrence = internalMutation({
  args: {
    userId: v.string(),
    cardId: v.id("cards"),
    categoryId: v.optional(v.id("categories")),
    description: v.string(),
    amount: v.number(),
    date: v.number(),
    recurringId: v.id("recurringTransactions"),
    nextOccurrence: v.number(),
  },
  handler: async (ctx, args) => {
    const { recurringId, nextOccurrence, ...purchaseArgs } = args;
    const card = await ctx.db.get(purchaseArgs.cardId);
    if (!card || card.userId !== purchaseArgs.userId) return;

    const month = toMonthString(purchaseArgs.date);
    const now = Date.now();

    const purchaseId = await ctx.db.insert("cardPurchases", {
      userId: purchaseArgs.userId,
      cardId: purchaseArgs.cardId,
      categoryId: purchaseArgs.categoryId,
      description: purchaseArgs.description,
      totalAmount: purchaseArgs.amount,
      totalWithInterest: purchaseArgs.amount,
      totalInstallments: 1,
      paidInstallments: 0,
      amountPerInstallment: purchaseArgs.amount,
      hasInterest: false,
      totalInterest: 0,
      currency: card.currency,
      purchaseDate: purchaseArgs.date,
      firstInstallmentDate: purchaseArgs.date,
      status: "activa",
      createdAt: now,
      updatedAt: now,
    });

    const installmentId = await ctx.db.insert("cardInstallments", {
      userId: purchaseArgs.userId,
      purchaseId,
      cardId: purchaseArgs.cardId,
      installmentNumber: 1,
      amount: purchaseArgs.amount,
      principalAmount: purchaseArgs.amount,
      interestAmount: 0,
      remainingPrincipal: 0,
      dueDate: purchaseArgs.date,
      month,
      paid: false,
      createdAt: now,
    });

    await ctx.db.insert("transactions", {
      userId: purchaseArgs.userId,
      type: "gasto_tarjeta",
      amount: purchaseArgs.amount,
      description: purchaseArgs.description,
      date: purchaseArgs.date,
      month,
      currency: card.currency,
      cardId: purchaseArgs.cardId,
      cardInstallmentId: installmentId,
      cardPurchaseId: purchaseId,
      categoryId: purchaseArgs.categoryId,
      status: "completada",
      isRecurring: true,
      recurringId,
      createdAt: now,
      updatedAt: now,
    });

    if (purchaseArgs.categoryId) {
      await applyBudgetDelta(ctx, purchaseArgs.userId, purchaseArgs.categoryId, month, purchaseArgs.amount, card.currency);
    }

    const newBalance = card.currentBalance + purchaseArgs.amount;
    await ctx.db.patch(purchaseArgs.cardId, {
      currentBalance: newBalance,
      availableCredit: Math.max(0, card.creditLimit - newBalance),
      updatedAt: now,
    });

    await ctx.db.patch(recurringId, { nextOccurrence, updatedAt: now });
  },
});
