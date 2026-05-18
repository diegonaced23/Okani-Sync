import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser, getCurrentUserId } from "./lib/auth";
import { toMonthString, getSystemPaymentCategoryId } from "./lib/utils";
import { recomputeInstallmentsPaid, getBillingCycleDates, getNextPaymentTs } from "./lib/cardHelpers";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await getCurrentUserId(ctx);
    return await ctx.db
      .query("cards")
      .withIndex("by_user_archived", (q) =>
        q.eq("userId", clerkId).eq("archived", false)
      )
      .collect();
  },
});

export const getById = query({
  args: { cardId: v.id("cards") },
  handler: async (ctx, { cardId }) => {
    const clerkId = await getCurrentUserId(ctx);
    const card = await ctx.db.get(cardId);
    if (!card || card.userId !== clerkId) return null;
    return card;
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    bankName: v.string(),
    lastFourDigits: v.string(),
    brand: v.optional(
      v.union(
        v.literal("visa"),
        v.literal("mastercard"),
        v.literal("amex"),
        v.literal("diners"),
        v.literal("otro")
      )
    ),
    creditLimit: v.number(),   // en centavos
    cutoffDay: v.number(),
    paymentDay: v.number(),
    interestRate: v.optional(v.number()),
    currency: v.string(),
    color: v.string(),
    icon: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.name.length === 0 || args.name.length > 100) throw new Error("El nombre debe tener entre 1 y 100 caracteres");
    if (!/^\d{4}$/.test(args.lastFourDigits)) throw new Error("Los últimos cuatro dígitos deben ser exactamente 4 números");
    if (args.creditLimit <= 0 || !Number.isFinite(args.creditLimit)) throw new Error("El límite de crédito debe ser mayor que cero");
    if (!/^[A-Za-z]{3}$/.test(args.currency)) throw new Error("Código de moneda inválido");
    if (args.cutoffDay < 1 || args.cutoffDay > 31) throw new Error("El día de corte debe estar entre 1 y 31");
    if (args.paymentDay < 1 || args.paymentDay > 31) throw new Error("El día de pago debe estar entre 1 y 31");
    if (args.interestRate !== undefined && (args.interestRate < 0 || args.interestRate > 1000)) throw new Error("La tasa de interés debe estar entre 0 y 1000");
    if (args.notes !== undefined && args.notes.length > 500) throw new Error("Las notas no pueden superar 500 caracteres");

    const user = await getCurrentUser(ctx);
    const now = Date.now();
    return await ctx.db.insert("cards", {
      userId: user.clerkId,
      name: args.name,
      bankName: args.bankName,
      lastFourDigits: args.lastFourDigits,
      brand: args.brand,
      creditLimit: args.creditLimit,
      currentBalance: 0,
      availableCredit: args.creditLimit,
      cutoffDay: args.cutoffDay,
      paymentDay: args.paymentDay,
      interestRate: args.interestRate,
      currency: args.currency,
      color: args.color,
      icon: args.icon,
      archived: false,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    cardId: v.id("cards"),
    name: v.optional(v.string()),
    bankName: v.optional(v.string()),
    creditLimit: v.optional(v.number()),
    interestRate: v.optional(v.number()),
    cutoffDay: v.optional(v.number()),
    paymentDay: v.optional(v.number()),
    color: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { cardId, creditLimit, ...fields }) => {
    if (fields.name !== undefined && (fields.name.length === 0 || fields.name.length > 100)) throw new Error("El nombre debe tener entre 1 y 100 caracteres");
    if (creditLimit !== undefined && (creditLimit <= 0 || !Number.isFinite(creditLimit))) throw new Error("El límite de crédito debe ser mayor que cero");
    if (fields.cutoffDay !== undefined && (fields.cutoffDay < 1 || fields.cutoffDay > 31)) throw new Error("El día de corte debe estar entre 1 y 31");
    if (fields.paymentDay !== undefined && (fields.paymentDay < 1 || fields.paymentDay > 31)) throw new Error("El día de pago debe estar entre 1 y 31");
    if (fields.interestRate !== undefined && (fields.interestRate < 0 || fields.interestRate > 1000)) throw new Error("La tasa de interés debe estar entre 0 y 1000");
    if (fields.notes !== undefined && fields.notes.length > 500) throw new Error("Las notas no pueden superar 500 caracteres");

    const user = await getCurrentUser(ctx);
    const card = await ctx.db.get(cardId);
    if (!card || card.userId !== user.clerkId) throw new Error("Tarjeta no encontrada");

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) patch[k] = v;
    }
    if (creditLimit !== undefined) {
      patch.creditLimit = creditLimit;
      patch.availableCredit = creditLimit - card.currentBalance;
    }
    await ctx.db.patch(cardId, patch);
  },
});

export const archive = mutation({
  args: { cardId: v.id("cards") },
  handler: async (ctx, { cardId }) => {
    const user = await getCurrentUser(ctx);
    const card = await ctx.db.get(cardId);
    if (!card || card.userId !== user.clerkId) throw new Error("Tarjeta no encontrada");
    await ctx.db.patch(cardId, { archived: true, updatedAt: Date.now() });
  },
});

/**
 * Registra un pago de tarjeta de crédito.
 * Descuenta de la cuenta de origen, reduce la deuda de la tarjeta,
 * y genera una tx `pago_tarjeta` con categoría sistema "Pago de tarjeta".
 */
export const payCard = mutation({
  args: {
    cardId: v.id("cards"),
    fromAccountId: v.id("accounts"),
    amount: v.number(),          // en centavos
    paymentDate: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.amount <= 0 || !Number.isFinite(args.amount)) {
      throw new Error("El monto debe ser mayor que cero");
    }
    if (args.notes !== undefined && args.notes.length > 500) {
      throw new Error("Las notas no pueden superar 500 caracteres");
    }

    const user = await getCurrentUser(ctx);

    const card = await ctx.db.get(args.cardId);
    if (!card || card.userId !== user.clerkId) throw new Error("Tarjeta no encontrada");
    if (card.currentBalance <= 0) throw new Error("La tarjeta no tiene deuda pendiente");

    const account = await ctx.db.get(args.fromAccountId);
    if (!account) throw new Error("Cuenta no encontrada");
    if (account.currency !== card.currency) {
      throw new Error(`La cuenta usa ${account.currency} pero la tarjeta es en ${card.currency}`);
    }

    const paymentAmount = Math.min(args.amount, card.currentBalance);
    const paymentDate = args.paymentDate ?? Date.now();
    const month = toMonthString(paymentDate);
    const now = Date.now();

    const categoryId = await getSystemPaymentCategoryId(ctx, user.clerkId);

    await ctx.db.insert("transactions", {
      userId: user.clerkId,
      type: "pago_tarjeta",
      amount: paymentAmount,
      description: `Pago de ${card.name} ····${card.lastFourDigits}`,
      date: paymentDate,
      month,
      currency: card.currency,
      accountId: args.fromAccountId,
      cardId: args.cardId,
      categoryId,
      notes: args.notes,
      status: "completada",
      isRecurring: false,
      createdAt: now,
      updatedAt: now,
    });

    // Descontar de la cuenta
    await ctx.db.patch(args.fromAccountId, {
      balance: account.balance - paymentAmount,
      updatedAt: now,
    });

    // Reducir deuda de la tarjeta
    const newBalance = Math.max(0, card.currentBalance - paymentAmount);
    await ctx.db.patch(args.cardId, {
      currentBalance: newBalance,
      availableCredit: Math.min(card.creditLimit, card.availableCredit + paymentAmount),
      updatedAt: now,
    });

    // Recalcular estado de cuotas FIFO
    await recomputeInstallmentsPaid(ctx, args.cardId);
  },
});

/**
 * Calcula el pago mínimo y el pago total recomendado para la tarjeta.
 *
 * Pago mínimo: suma de cuotas no pagadas cuyo vencimiento cae dentro del
 * ciclo de facturación actual (entre el corte anterior y el próximo corte).
 *
 * Pago total: para compras SIN interés → paga todas las cuotas restantes de una vez;
 * para compras CON interés → solo la cuota actual (capital + interés del período),
 * ya que las futuras aún no devengan.
 */
export const getPaymentSummary = query({
  args: { cardId: v.id("cards") },
  handler: async (ctx, { cardId }) => {
    const clerkId = await getCurrentUserId(ctx);
    const card = await ctx.db.get(cardId);
    if (!card || card.userId !== clerkId) return null;

    // Sin deuda no hay nada que calcular
    if (card.currentBalance <= 0) {
      return { minimumPayment: 0, totalPayment: 0, currency: card.currency };
    }

    const { prevCutoffTs, nextCutoffTs } = getBillingCycleDates(card.cutoffDay);

    // Compras activas de esta tarjeta
    const activePurchases = await ctx.db
      .query("cardPurchases")
      .withIndex("by_card", (q) => q.eq("cardId", cardId))
      .filter((q) => q.eq(q.field("status"), "activa"))
      .collect();

    let minimumPayment = 0;
    let totalPayment = 0;

    for (const purchase of activePurchases) {
      // Cuotas no pagadas de esta compra ordenadas de más antigua a más reciente
      const unpaid = await ctx.db
        .query("cardInstallments")
        .withIndex("by_purchase", (q) => q.eq("purchaseId", purchase._id))
        .filter((q) => q.eq(q.field("paid"), false))
        .collect();

      unpaid.sort((a, b) => a.dueDate - b.dueDate);

      // Pago mínimo: cuotas cuya fecha de vencimiento cae dentro del ciclo actual
      for (const inst of unpaid) {
        if (inst.dueDate > prevCutoffTs && inst.dueDate <= nextCutoffTs) {
          minimumPayment += inst.amount;
        }
      }

      // Pago total según si la compra genera interés
      if (purchase.hasInterest) {
        // Con interés: solo la cuota más antigua pendiente (capital + interés del período).
        // No conviene pagar anticipado porque el interés de cuotas futuras ya está fijo.
        if (unpaid.length > 0) {
          totalPayment += unpaid[0].amount;
        }
      } else {
        // Sin interés: paga todo lo que queda de una vez sin penalidad
        for (const inst of unpaid) {
          totalPayment += inst.amount;
        }
      }
    }

    return { minimumPayment, totalPayment, currency: card.currency };
  },
});

/**
 * Devuelve en una sola subscripción todo lo necesario para la página de detalle
 * de una tarjeta: compras activas, cuotas clasificadas por ciclo de facturación,
 * cronogramas completos (elimina N+1 de PurchaseRow) y montos de pago.
 *
 * Clasificación de cuotas:
 *   overdueCuotas       — !paid && dueDate ≤ prevCutoffTs   (vencidas sin pagar)
 *   currentCycleCuotas  — !paid && dueDate ∈ (prev, next]   (lo que suma el pago mínimo)
 *
 * Compras del ciclo en curso:
 *   purchasesInCurrentCycle — purchaseDate ∈ (prevCutoffTs, nextCutoffTs]
 */
export const getCardDetailData = query({
  args: { cardId: v.id("cards") },
  handler: async (ctx, { cardId }) => {
    const clerkId = await getCurrentUserId(ctx);
    const card = await ctx.db.get(cardId);
    if (!card || card.userId !== clerkId) return null;

    const { prevCutoffTs, nextCutoffTs } = getBillingCycleDates(card.cutoffDay);
    // Calculamos ambas fechas de pago:
    //   prevPaymentTs → la que correspondía al ciclo anterior (puede ya haber vencido)
    //   nextPaymentTs → la que corresponde al ciclo que cierra en nextCutoffTs
    const prevPaymentTs = getNextPaymentTs(card.paymentDay, prevCutoffTs);
    const nextPaymentTs = getNextPaymentTs(card.paymentDay, nextCutoffTs);

    // Todas las compras activas de la tarjeta
    const allPurchases = await ctx.db
      .query("cardPurchases")
      .withIndex("by_card", (q) => q.eq("cardId", cardId))
      .filter((q) => q.eq(q.field("status"), "activa"))
      .collect();

    // Acumuladores
    const installmentsByPurchase: Record<string, Array<{
      _id: string; purchaseId: string; cardId: string; userId: string;
      installmentNumber: number; amount: number; dueDate: number;
      month: string; paid: boolean; paidAt?: number; createdAt: number;
      principalAmount?: number; interestAmount?: number; remainingPrincipal?: number;
    }>> = {};

    // Cuotas del ciclo para mostrar en "A pagar"
    const overdueCuotas: string[] = [];    // IDs de cuotas vencidas
    const currentCycleCuotas: string[] = []; // IDs de cuotas del ciclo actual
    // Mapa id → cuota para lookup rápido
    const installmentById: Record<string, (typeof installmentsByPurchase)[string][number]> = {};

    let minimumPayment = 0;
    let totalPayment = 0;

    for (const purchase of allPurchases) {
      const installments = await ctx.db
        .query("cardInstallments")
        .withIndex("by_purchase", (q) => q.eq("purchaseId", purchase._id))
        .collect();

      // Guardar el cronograma completo (pagadas + no pagadas) para el Tab 3
      installmentsByPurchase[purchase._id] = installments.map((i) => ({
        _id: i._id,
        purchaseId: i.purchaseId,
        cardId: i.cardId,
        userId: i.userId,
        installmentNumber: i.installmentNumber,
        amount: i.amount,
        dueDate: i.dueDate,
        month: i.month,
        paid: i.paid,
        paidAt: i.paidAt,
        createdAt: i.createdAt,
        principalAmount: i.principalAmount,
        interestAmount: i.interestAmount,
        remainingPrincipal: i.remainingPrincipal,
      }));

      for (const inst of installments) {
        installmentById[inst._id] = installmentsByPurchase[purchase._id].find(
          (i) => i._id === inst._id
        )!;
      }

      // Cuotas no pagadas ordenadas de más antigua a más reciente (FIFO)
      const unpaid = installments
        .filter((i) => !i.paid)
        .sort((a, b) => a.dueDate - b.dueDate);

      for (const inst of unpaid) {
        if (inst.dueDate <= prevCutoffTs) {
          overdueCuotas.push(inst._id);
        } else if (inst.dueDate <= nextCutoffTs) {
          currentCycleCuotas.push(inst._id);
          minimumPayment += inst.amount;
        }
      }

      // Pago total: sin interés → todas las cuotas; con interés → solo la más antigua
      if (purchase.hasInterest) {
        if (unpaid.length > 0) totalPayment += unpaid[0].amount;
      } else {
        for (const inst of unpaid) totalPayment += inst.amount;
      }
    }

    // Ordenar globalmente por dueDate usando el mapa de lookup.
    // Sin este sort, el orden depende de cuál compra se iteró primero (incorrecto).
    overdueCuotas.sort(
      (a, b) => (installmentById[a]?.dueDate ?? 0) - (installmentById[b]?.dueDate ?? 0)
    );
    currentCycleCuotas.sort(
      (a, b) => (installmentById[a]?.dueDate ?? 0) - (installmentById[b]?.dueDate ?? 0)
    );

    // Compras hechas en el ciclo en curso (para el tab "Ciclo actual"), desc por fecha
    const purchasesInCurrentCycle = allPurchases
      .filter((p) => p.purchaseDate > prevCutoffTs && p.purchaseDate <= nextCutoffTs)
      .sort((a, b) => b.purchaseDate - a.purchaseDate);

    return {
      card,
      cycle: {
        prevCutoffTs,
        nextCutoffTs,
        // prevPaymentTs: vencimiento del ciclo anterior (puede ser pasado si no se pagó)
        // nextPaymentTs: vencimiento del ciclo actual (siempre futuro)
        prevPaymentTs,
        nextPaymentTs,
      },
      // IDs ordenados cronológicamente, lookup via installmentById
      overdueCuotas,
      currentCycleCuotas,
      installmentById,
      purchasesInCurrentCycle,
      allPurchases,
      installmentsByPurchase,
      minimumPayment,
      totalPayment,
    };
  },
});

/** Elimina la tarjeta y todos sus registros asociados (cascade). */
export const remove = mutation({
  args: { cardId: v.id("cards") },
  handler: async (ctx, { cardId }) => {
    const user = await getCurrentUser(ctx);
    const card = await ctx.db.get(cardId);
    if (!card || card.userId !== user.clerkId) throw new Error("Tarjeta no encontrada");

    // 1. Compras y sus cuotas
    const purchases = await ctx.db
      .query("cardPurchases")
      .withIndex("by_card", (q) => q.eq("cardId", cardId))
      .collect();

    for (const purchase of purchases) {
      const installments = await ctx.db
        .query("cardInstallments")
        .withIndex("by_purchase", (q) => q.eq("purchaseId", purchase._id))
        .collect();
      for (const inst of installments) {
        await ctx.db.delete(inst._id);
      }
      await ctx.db.delete(purchase._id);
    }

    // 2. Transacciones vinculadas a esta tarjeta
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_card", (q) => q.eq("cardId", cardId))
      .collect();
    for (const tx of transactions) {
      await ctx.db.delete(tx._id);
    }

    // 3. Transacciones recurrentes que referencien esta tarjeta
    const recurring = await ctx.db
      .query("recurringTransactions")
      .withIndex("by_user", (q) => q.eq("userId", user.clerkId))
      .collect();
    for (const rt of recurring) {
      if (rt.cardId === cardId || rt.targetCardId === cardId) {
        await ctx.db.delete(rt._id);
      }
    }

    // 4. La tarjeta
    await ctx.db.delete(cardId);
  },
});
