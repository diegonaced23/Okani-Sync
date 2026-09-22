import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";

import { getCurrentUser, getCurrentUserId } from "./lib/auth";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { calculateInstallment, convertAmount, getUserRateMap } from "./lib/money";
import { assertValidMonth, getLegacyInterestsCategoryId, monthRange, toMonthString } from "./lib/utils";
import { applyBudgetDelta } from "./lib/transactionEffects";
import { categoryRotationDeltas } from "./lib/cardBudget";
import { balanceScheduleToPrincipal, cuotaChargeDates } from "./lib/cardSchedule";
import { billInstallment, billDueInstallmentsForCard, cuotaDescription } from "./lib/cardBilling";
import { recomputeInstallmentsPaid } from "./lib/cardHelpers";
import { installmentDue, installmentRemaining, isNotYetExpensed } from "../src/lib/cardPayments";

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
    assertValidMonth(month);
    const clerkId = await getCurrentUserId(ctx);
    const { start, end } = monthRange(month);
    return await ctx.db
      .query("cardPurchases")
      .withIndex("by_user_status_purchaseDate", (q) =>
        q.eq("userId", clerkId).eq("status", "activa").gte("purchaseDate", start).lt("purchaseDate", end)
      )
      .collect();
  },
});

/**
 * Compras con tarjeta del mes que todavía no cuentan como gasto.
 *
 * Una cuota cuenta como gasto cuando se factura (en el corte), así que una
 * compra a cuotas de hoy puede no aparecer en «Gastos del mes» hasta el mes
 * siguiente. El dashboard muestra este total aparte para que se vea sin contarlo
 * dos veces: suma el capital de las cuotas aún no registradas como gasto, de las
 * compras hechas en `month`, convertido a la moneda preferida. Las compras sin
 * tasa de cambio quedan fuera y se avisa con `missingRate`.
 */
export const pendingBilling = query({
  args: { month: v.string() },
  handler: async (ctx, { month }) => {
    assertValidMonth(month);
    const user = await getCurrentUser(ctx);
    const { rateMap, preferredCurrency } = await getUserRateMap(ctx, user);
    const { start, end } = monthRange(month);

    const purchases = (
      await Promise.all(
        (["activa", "pagada"] as const).map((status) =>
          ctx.db
            .query("cardPurchases")
            .withIndex("by_user_status_purchaseDate", (q) =>
              q.eq("userId", user.clerkId).eq("status", status).gte("purchaseDate", start).lt("purchaseDate", end)
            )
            .collect()
        )
      )
    ).flat();

    let amount = 0;
    let count = 0;
    let missingRate = false;
    for (const purchase of purchases) {
      const installments = await ctx.db
        .query("cardInstallments")
        .withIndex("by_purchase", (q) => q.eq("purchaseId", purchase._id))
        .collect();
      const pending = installments
        .filter((i) => isNotYetExpensed(i, month))
        .reduce((s, i) => s + (i.principalAmount ?? i.amount), 0);
      if (pending <= 0) continue;
      const { converted, hasRate } = convertAmount(pending, purchase.currency, preferredCurrency, rateMap);
      if (!hasRate) {
        missingRate = true;
        continue;
      }
      amount += converted;
      count += 1;
    }

    return { currency: preferredCurrency, amount, count, missingRate };
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** interestRate es decimal (0.08 = 8%): fuera de rango daría cuotas astronómicas. */
function assertInterestRate(hasInterest: boolean, interestRate: number | undefined) {
  if (
    hasInterest &&
    interestRate !== undefined &&
    (interestRate < 0 || !Number.isFinite(interestRate) || interestRate > 2)
  ) {
    throw new Error("La tasa de interés debe ser un decimal entre 0 y 2 (0% a 200%)");
  }
}

/**
 * Cronograma de una compra con el capital cuadrado a centavo (ver
 * `balanceScheduleToPrincipal`) y los totales que salen de él.
 */
function scheduleFor(totalAmount: number, rate: number, installments: number) {
  const result = calculateInstallment(totalAmount, rate, installments);
  const schedule = balanceScheduleToPrincipal(result.schedule, totalAmount);
  const totalWithInterest = schedule.reduce((s, i) => s + i.amount, 0);
  return {
    schedule,
    amountPerInstallment: result.amountPerInstallment,
    totalWithInterest,
    totalInterest: totalWithInterest - totalAmount,
  };
}

/**
 * Crea el cronograma de una compra y factura lo que ya tocaba.
 *
 * - Las fechas de cargo salen del ciclo de la tarjeta (`cuotaChargeDates`): de
 *   contado, el día de la compra; a cuotas, cada corte a partir del de la compra.
 * - La deuda sube por el CAPITAL. El interés de cada cuota se suma cuando se
 *   factura (ver `lib/cardBilling.ts`).
 * - Las cuotas cuyo cargo ya pasó (de contado, o una compra con fecha atrasada)
 *   se facturan aquí mismo: su gasto aparece de inmediato.
 */
async function buildSchedule(
  ctx: MutationCtx,
  args: {
    card: Doc<"cards">;
    purchase: Doc<"cardPurchases">;
    recurringId?: Id<"recurringTransactions">;
  }
) {
  const { card, purchase, recurringId } = args;
  const rate = purchase.hasInterest ? (purchase.interestRate ?? 0) : 0;
  const result = scheduleFor(purchase.totalAmount, rate, purchase.totalInstallments);
  const dates = cuotaChargeDates(purchase.purchaseDate, card.cutoffDay, purchase.totalInstallments);
  const now = Date.now();

  for (const item of result.schedule) {
    const dueDate = dates[item.installmentNumber - 1];
    await ctx.db.insert("cardInstallments", {
      userId: purchase.userId,
      purchaseId: purchase._id,
      cardId: card._id,
      installmentNumber: item.installmentNumber,
      amount: item.amount,
      principalAmount: item.principalAmount,
      interestAmount: item.interestAmount,
      remainingPrincipal: item.remainingPrincipal,
      dueDate,
      month: toMonthString(dueDate),
      paid: false,
      paidAmount: 0,
      interestBilling: "at_cutoff",
      createdAt: now,
    });
  }

  await ctx.db.patch(card._id, {
    currentBalance: card.currentBalance + purchase.totalAmount,
    availableCredit: Math.max(0, card.creditLimit - (card.currentBalance + purchase.totalAmount)),
    updatedAt: now,
  });

  // La recurrente marca su propio movimiento; el resto lo factura el helper común
  if (recurringId) {
    const insts = await ctx.db
      .query("cardInstallments")
      .withIndex("by_purchase", (q) => q.eq("purchaseId", purchase._id))
      .collect();
    for (const inst of insts) {
      if (inst.dueDate > now) continue;
      const fresh = await ctx.db.get(card._id);
      if (fresh) await billInstallment(ctx, { inst, purchase, card: fresh, now, recurringId });
    }
  }
  await billDueInstallmentsForCard(ctx, card._id, now);
  await recomputeInstallmentsPaid(ctx, card._id);

  return result;
}

/**
 * Categoría donde el modelo anterior puso el interés de una cuota en el
 * presupuesto (la de sistema, si existía). Solo para revertir datos sin migrar.
 */
async function legacyInterestBudgetCategory(
  ctx: MutationCtx,
  purchase: Doc<"cardPurchases">
): Promise<Id<"categories"> | undefined> {
  return purchase.hasInterest ? getLegacyInterestsCategoryId(ctx, purchase.userId) : undefined;
}

/**
 * Borra los movimientos y el cronograma de una compra, devolviendo lo que cada
 * movimiento había sumado al presupuesto. Devuelve lo que la compra aún debía
 * (para descontarlo de la deuda de la tarjeta).
 */
async function deleteSchedule(ctx: MutationCtx, purchase: Doc<"cardPurchases">): Promise<number> {
  const installments = await ctx.db
    .query("cardInstallments")
    .withIndex("by_purchase", (q) => q.eq("purchaseId", purchase._id))
    .collect();
  const legacyInterestCat = await legacyInterestBudgetCategory(ctx, purchase);

  let outstanding = 0;
  // Secuencial: applyBudgetDelta hace read-modify-write sobre el mismo presupuesto (cat+mes)
  for (const inst of installments) {
    outstanding += installmentRemaining(inst);
    const txs = await ctx.db
      .query("transactions")
      .withIndex("by_card_installment", (q) => q.eq("cardId", purchase.cardId).eq("cardInstallmentId", inst._id))
      .collect();
    for (const tx of txs) {
      if (tx.cardChargeKind) {
        // Modelo nuevo: cada movimiento sumó su monto entero a su categoría
        if (tx.categoryId) await applyBudgetDelta(ctx, tx.userId, tx.categoryId, tx.month, -tx.amount, tx.currency);
      } else {
        // Modelo anterior: la cuota entera, con el interés en la categoría de intereses
        const interest = legacyInterestCat ? (inst.interestAmount ?? 0) : 0;
        if (tx.categoryId) await applyBudgetDelta(ctx, tx.userId, tx.categoryId, tx.month, -(tx.amount - interest), tx.currency);
        if (legacyInterestCat && interest > 0) await applyBudgetDelta(ctx, tx.userId, legacyInterestCat, tx.month, -interest, tx.currency);
      }
      await ctx.db.delete(tx._id);
    }
    await ctx.db.delete(inst._id);
  }
  return outstanding;
}

async function adjustCardBalance(ctx: MutationCtx, cardId: Id<"cards">, delta: number) {
  const card = await ctx.db.get(cardId);
  if (!card) return;
  const currentBalance = Math.max(0, card.currentBalance + delta);
  await ctx.db.patch(cardId, {
    currentBalance,
    availableCredit: Math.max(0, card.creditLimit - currentBalance),
    updatedAt: Date.now(),
  });
}

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
    /** Ya no se usa: las fechas de las cuotas salen del ciclo de la tarjeta.
     *  Se acepta para no romper clientes que aún lo envían. */
    firstInstallmentDate: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    const card = await ctx.db.get(args.cardId);
    if (!card || card.userId !== user.clerkId) {
      throw new Error("Tarjeta no encontrada");
    }
    assertInterestRate(args.hasInterest, args.interestRate);
    if (!Number.isInteger(args.totalInstallments) || args.totalInstallments < 1) {
      throw new Error("El número de cuotas debe ser al menos 1");
    }

    const rate = args.hasInterest ? (args.interestRate ?? 0) : 0;
    const result = scheduleFor(args.totalAmount, rate, args.totalInstallments);
    const dates = cuotaChargeDates(args.purchaseDate, card.cutoffDay, args.totalInstallments);
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
      firstInstallmentDate: dates[0],
      status: "activa",
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });

    const purchase = (await ctx.db.get(purchaseId))!;
    await buildSchedule(ctx, { card, purchase });
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
    /** true deja la compra sin nota. Igual que `clearCategory`: en un patch parcial,
     *  omitir el campo significa «no tocar», así que vaciar el textarea no borraba nada. */
    clearNotes: v.optional(v.boolean()),
    // Financieros — solo mientras no haya pagos ni intereses cobrados
    totalAmount: v.optional(v.number()),
    totalInstallments: v.optional(v.number()),
    hasInterest: v.optional(v.boolean()),
    interestRate: v.optional(v.number()),
    purchaseDate: v.optional(v.number()),
    /** Ya no se usa: las fechas de las cuotas salen del ciclo de la tarjeta. */
    firstInstallmentDate: v.optional(v.number()),
  },
  handler: async (ctx, { purchaseId, clearCategory, clearNotes, ...allFields }) => {
    // `firstInstallmentDate` se ignora: las fechas salen del ciclo de la tarjeta
    const { firstInstallmentDate, ...fields } = allFields;
    void firstInstallmentDate;
    if (clearNotes && fields.notes !== undefined) {
      throw new Error("No se puede escribir y borrar la nota a la vez");
    }
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
      (fields.purchaseDate !== undefined && fields.purchaseDate !== purchase.purchaseDate) ||
      (fields.interestRate !== undefined &&
        Math.abs(fields.interestRate - (purchase.interestRate ?? 0)) > 0.00001);

    if (financialChanged) {
      const card = await ctx.db.get(purchase.cardId);
      if (!card) throw new Error("Tarjeta no encontrada");

      const oldInstallments = await ctx.db
        .query("cardInstallments")
        .withIndex("by_purchase", (q) => q.eq("purchaseId", purchaseId))
        .collect();
      // Rehacer el cronograma borra lo facturado. Se permite mientras no haya nada
      // que perder: ni abonos a la compra ni intereses ya cobrados.
      const anyPaid = oldInstallments.some((i) => i.paid || (i.paidAmount ?? 0) > 0);
      const interestCharged = oldInstallments.some(
        (i) => i.interestBilling === "at_cutoff" && i.billedAt !== undefined && (i.interestAmount ?? 0) > 0
      );
      if (anyPaid || purchase.paidInstallments > 0) {
        throw new Error("No se pueden modificar los datos financieros cuando ya hay cuotas pagadas");
      }
      if (interestCharged) {
        throw new Error("No se pueden modificar los datos financieros: esta compra ya tiene intereses cobrados");
      }

      const totalAmount = fields.totalAmount ?? purchase.totalAmount;
      const totalInstallments = fields.totalInstallments ?? purchase.totalInstallments;
      const hasInterest = fields.hasInterest ?? purchase.hasInterest;
      const interestRate = hasInterest ? (fields.interestRate ?? purchase.interestRate ?? 0) : undefined;
      assertInterestRate(hasInterest, interestRate);
      if (!Number.isInteger(totalInstallments) || totalInstallments < 1) {
        throw new Error("El número de cuotas debe ser al menos 1");
      }
      const purchaseDate = fields.purchaseDate ?? purchase.purchaseDate;
      const finalCategoryId = clearCategory ? undefined : (fields.categoryId ?? purchase.categoryId);

      // Lo que la compra había cargado a la deuda (en el modelo anterior, con
      // todo el interés; en el nuevo, el capital) sale antes de volver a cargar.
      const oldCharge = oldInstallments.reduce((s, i) => s + installmentDue(i), 0);
      await deleteSchedule(ctx, purchase);
      await adjustCardBalance(ctx, card._id, -oldCharge);

      const result = scheduleFor(totalAmount, interestRate ?? 0, totalInstallments);
      const dates = cuotaChargeDates(purchaseDate, card.cutoffDay, totalInstallments);
      await ctx.db.patch(purchaseId, {
        description: fields.description?.trim() ?? purchase.description,
        categoryId: finalCategoryId,
        notes: clearNotes ? undefined : fields.notes !== undefined ? fields.notes : purchase.notes,
        totalAmount,
        totalWithInterest: result.totalWithInterest,
        totalInstallments,
        paidInstallments: 0,
        amountPerInstallment: result.amountPerInstallment,
        hasInterest,
        interestRate,
        totalInterest: result.totalInterest,
        purchaseDate,
        firstInstallmentDate: dates[0],
        status: "activa",
        updatedAt: now,
      });

      const fresh = (await ctx.db.get(purchaseId))!;
      const freshCard = (await ctx.db.get(card._id))!;
      await buildSchedule(ctx, { card: freshCard, purchase: fresh });
      return;
    }

    const patch: Record<string, unknown> = { updatedAt: now };
    if (fields.description !== undefined) patch.description = fields.description.trim();
    if (clearCategory) patch.categoryId = undefined;
    else if (fields.categoryId !== undefined) patch.categoryId = fields.categoryId;
    // undefined en un patch de Convex borra el campo
    if (clearNotes) patch.notes = undefined;
    else if (fields.notes !== undefined) patch.notes = fields.notes;
    await ctx.db.patch(purchaseId, patch);

    const installments = await ctx.db
      .query("cardInstallments")
      .withIndex("by_purchase", (q) => q.eq("purchaseId", purchaseId))
      .collect();

    // Si cambió la categoría, mover el presupuesto y los movimientos de capital
    const categoryChanged =
      clearCategory || (fields.categoryId !== undefined && fields.categoryId !== purchase.categoryId);
    if (categoryChanged) {
      const newCatId = clearCategory ? undefined : fields.categoryId;
      for (const inst of installments) {
        const txs = await ctx.db
          .query("transactions")
          .withIndex("by_card_installment", (q) => q.eq("cardId", purchase.cardId).eq("cardInstallmentId", inst._id))
          .collect();
        for (const tx of txs) {
          // El interés se queda en su categoría: solo el capital viaja con la compra
          if (tx.cardChargeKind === "interes") continue;
          const legacyInterestCat = tx.cardChargeKind ? undefined : await legacyInterestBudgetCategory(ctx, purchase);
          // Secuencial: applyBudgetDelta hace read-modify-write sobre el mismo presupuesto (cat+mes)
          const deltas = categoryRotationDeltas({
            installments: [{ month: tx.month, amount: tx.amount, principalAmount: tx.cardChargeKind ? tx.amount : inst.principalAmount }],
            oldCategoryId: purchase.categoryId,
            newCategoryId: newCatId,
            interestsCategoryId: tx.cardChargeKind ? undefined : legacyInterestCat,
          });
          for (const d of deltas) {
            await applyBudgetDelta(ctx, user.clerkId, d.categoryId, d.month, d.delta, purchase.currency);
          }
          await ctx.db.patch(tx._id, { categoryId: newCatId, updatedAt: now });
        }
      }
    }

    // Si cambió la descripción, actualizar los movimientos de la compra
    if (fields.description !== undefined) {
      const renamed = { ...purchase, description: fields.description.trim() };
      for (const inst of installments) {
        const txs = await ctx.db
          .query("transactions")
          .withIndex("by_card_installment", (q) => q.eq("cardId", purchase.cardId).eq("cardInstallmentId", inst._id))
          .collect();
        for (const tx of txs) {
          const base = cuotaDescription(renamed, inst.installmentNumber);
          await ctx.db.patch(tx._id, {
            description: tx.cardChargeKind === "interes" ? `Intereses — ${base}` : base,
            updatedAt: now,
          });
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

    // Sale de la deuda lo que la compra aún debía; lo ya pagado queda pagado
    const outstanding = await deleteSchedule(ctx, purchase);
    await adjustCardBalance(ctx, purchase.cardId, -outstanding);
    await ctx.db.delete(purchaseId);
    await recomputeInstallmentsPaid(ctx, purchase.cardId);
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
    const card = await ctx.db.get(args.cardId);
    if (!card || card.userId !== args.userId) return;
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

    const purchase = (await ctx.db.get(purchaseId))!;
    await buildSchedule(ctx, { card, purchase, recurringId: args.recurringId });
    await ctx.db.patch(args.recurringId, { nextOccurrence: args.nextOccurrence, updatedAt: now });
  },
});
