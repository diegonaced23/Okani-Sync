import type { MutationCtx } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";
import { recomputeInstallmentsPaid } from "./cardHelpers";
import { buildRateMap, convertAmount } from "./money";
import { getLegacyInterestsCategoryId } from "./utils";

// ─── Helpers de delta ─────────────────────────────────────────────────────────

/**
 * Estado de una deuda o préstamo al que se le devuelve saldo (se borra un abono).
 * Si estaba saldado vuelve a quedar pendiente: vencido si su fecha límite ya pasó.
 */
export function reopenedStatus(
  status: "activa" | "pagada" | "vencida",
  dueDate: number | undefined,
  now = Date.now()
): "activa" | "vencida" {
  if (status === "vencida") return "vencida";
  return dueDate !== undefined && dueDate < now ? "vencida" : "activa";
}

export async function applyAccountDelta(
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

export async function applyCardDelta(
  ctx: MutationCtx,
  cardId: Id<"cards">,
  delta: number // positivo = más deuda, negativo = reversión
) {
  const card = await ctx.db.get(cardId);
  if (!card) throw new Error("Tarjeta no encontrada");
  const newBalance = card.currentBalance + delta;
  await ctx.db.patch(cardId, {
    currentBalance: newBalance,
    availableCredit: card.creditLimit - newBalance,
    updatedAt: Date.now(),
  });
}

/**
 * Aplica un delta al campo `budget.spent`, convirtiendo la moneda si es necesario.
 *
 * @param txCurrency - Moneda de la transacción (ej: "USD"). Si difiere de `budget.currency`,
 *   se convierte usando las tasas actuales. Si no se provee, se asume que el delta ya está
 *   en la moneda del presupuesto.
 *
 * Nota: create y delete usan las tasas ACTUALES en el momento de la operación. Si las tasas
 * cambian entre la creación y la eliminación de una tx, `budget.spent` puede derivar
 * ligeramente. Se acepta esta imprecisión; el `Math.max(0, …)` evita negativos.
 */
export async function applyBudgetDelta(
  ctx: MutationCtx,
  userId: string,
  categoryId: Id<"categories">,
  month: string,
  delta: number,
  txCurrency?: string
) {
  const budget = await ctx.db
    .query("budgets")
    .withIndex("by_user_category_month", (q) =>
      q.eq("userId", userId).eq("categoryId", categoryId).eq("month", month)
    )
    .unique();
  if (!budget) return;

  let convertedDelta = delta;
  if (txCurrency && txCurrency !== budget.currency) {
    const rates = await ctx.db.query("currentExchangeRates").collect();
    const rateMap = buildRateMap(rates, budget.currency);
    const { converted } = convertAmount(delta, txCurrency, budget.currency, rateMap);
    convertedDelta = converted;
  }

  await ctx.db.patch(budget._id, {
    spent: Math.max(0, budget.spent + convertedDelta),
    updatedAt: Date.now(),
  });
}

/**
 * Aplica un delta al acumulado de una meta de ahorro manual.
 * Solo afecta metas sin `linkedAccountId` (las vinculadas a cuenta se actualizan
 * vía el saldo de la cuenta). Si la meta no existe, retorna silenciosamente.
 *
 * @param delta - Positivo para abonar, negativo para revertir (centavos).
 */
export async function applyGoalDelta(
  ctx: MutationCtx,
  goalId: Id<"goals">,
  delta: number
) {
  const goal = await ctx.db.get(goalId);
  if (!goal || goal.linkedAccountId) return;
  const newAmount = Math.max(0, goal.currentAmount + delta);
  const completed = newAmount >= goal.targetAmount;
  await ctx.db.patch(goalId, {
    currentAmount: newAmount,
    status: completed ? "completada" : "activa",
    completedAt: completed && goal.status === "activa" ? Date.now() : goal.completedAt,
    updatedAt: Date.now(),
  });
}

// ─── Eliminación con reversión de efectos ────────────────────────────────────

/**
 * Revierte todos los efectos secundarios de una transacción y la elimina.
 *
 * Casos especiales:
 * - `ajuste`: se elimina sin revertir el saldo. El delta original no está preservado
 *   y no es seguro invertirlo. En `transactions.remove` (eliminación directa) se lanza
 *   un error antes de llegar aquí; en eliminaciones en cascada (cuenta/tarjeta eliminada)
 *   simplemente se borra sin revertir, que es el comportamiento correcto.
 * - `transferencia`: se procesan ambas piernas usando el `transferGroupId`; el caller
 *   debe garantizar que no llame a esta función dos veces con piernas del mismo grupo
 *   (usar un Set de transferGroupId procesados).
 *
 * Alcance actual: revierte efectos sobre cuentas, tarjetas, presupuestos, deudas
 * (`pago_deuda` restaura `debts.currentBalance` y elimina el `debtPayments` asociado)
 * y préstamos (`prestamo_cobrado` restaura `loans.currentBalance` y elimina el
 * `loanRepayments` asociado).
 */
export async function deleteTransactionWithEffects(
  ctx: MutationCtx,
  tx: Doc<"transactions">
) {
  // Ajuste: eliminar sin revertir (delta original no es recuperable de forma segura)
  if (tx.type === "ajuste") {
    await ctx.db.delete(tx._id);
    return;
  }

  // Transferencias: revertir y eliminar ambas piernas
  if (tx.transferGroupId) {
    const legs = await ctx.db
      .query("transactions")
      .withIndex("by_transfer_group", (q) => q.eq("transferGroupId", tx.transferGroupId!))
      .collect();
    // Preferir el campo explícito transferDirection; si algún registro legado no lo
    // tiene poblado, recurrir al orden por _creationTime (createTransfer siempre
    // inserta primero la pierna de salida) en vez de omitir la reversión en silencio.
    let outLeg = legs.find((l) => l.transferDirection === "out");
    let inLeg  = legs.find((l) => l.transferDirection === "in");
    if (!outLeg || !inLeg) {
      const sorted = [...legs].sort((a, b) => a._creationTime - b._creationTime);
      [outLeg, inLeg] = sorted;
    }
    if (outLeg?.accountId) await applyAccountDelta(ctx, outLeg.accountId, outLeg.amount);
    if (inLeg?.accountId) await applyAccountDelta(ctx, inLeg.accountId, -inLeg.amount);
    for (const leg of legs) await ctx.db.delete(leg._id);
    return;
  }

  // Revertir saldo de la cuenta
  if (tx.accountId) {
    if (tx.type === "pago_tarjeta") {
      // El pago descontó de la cuenta → devolver
      await applyAccountDelta(ctx, tx.accountId, tx.amount);
      // Y redujo la deuda de la tarjeta → restaurarla
      if (tx.cardId) await applyCardDelta(ctx, tx.cardId, tx.amount);
    } else {
      // ingreso y prestamo_cobrado son créditos (el dinero entró a la cuenta)
      const isCredit = tx.type === "ingreso" || tx.type === "prestamo_cobrado";
      const delta = isCredit ? -tx.amount : tx.amount;
      await applyAccountDelta(ctx, tx.accountId, delta);
    }
  }

  // Revertir balance de tarjeta para gastos directos legacy (type="gasto" con cardId)
  if (tx.cardId && tx.type === "gasto") {
    await applyCardDelta(ctx, tx.cardId, -tx.amount);
  }

  // Revertir gasto_tarjeta
  if (tx.type === "gasto_tarjeta") {
    if (tx.cardChargeKind) {
      // Modelo nuevo (capital o interés de una cuota). Solo llega aquí al borrar la
      // tarjeta entera: `transactions.remove` no deja borrar un movimiento suelto de
      // una cuota, porque el cronograma lo gestiona la compra.
      // - El interés entró a la deuda al facturarse → sale con él.
      // - El capital entró a la deuda con la compra, no con este movimiento → no se toca.
      if (tx.cardChargeKind === "interes" && tx.cardId) await applyCardDelta(ctx, tx.cardId, -tx.amount);
      if (tx.categoryId) await applyBudgetDelta(ctx, tx.userId, tx.categoryId, tx.month, -tx.amount, tx.currency);
    } else {
      // Modelo anterior: la cuota entera (capital + interés) estaba en la deuda y en
      // el presupuesto, con el interés en la categoría de sistema de intereses.
      if (tx.cardId) await applyCardDelta(ctx, tx.cardId, -tx.amount);

      let principalAmount = tx.amount;
      let interestAmount = 0;
      if (tx.cardInstallmentId) {
        const inst = await ctx.db.get(tx.cardInstallmentId);
        if (inst) {
          principalAmount = inst.principalAmount ?? tx.amount;
          interestAmount = inst.interestAmount ?? 0;
          await ctx.db.delete(inst._id);
        }
      }

      const interestsCatId = interestAmount > 0 ? await getLegacyInterestsCategoryId(ctx, tx.userId) : undefined;
      if (tx.categoryId) {
        const toRevert = interestsCatId ? principalAmount : tx.amount;
        await applyBudgetDelta(ctx, tx.userId, tx.categoryId, tx.month, -toRevert, tx.currency);
      }
      if (interestsCatId) {
        await applyBudgetDelta(ctx, tx.userId, interestsCatId, tx.month, -interestAmount, tx.currency);
      }
    }
  }

  // Revertir budget.spent para gastos directos de cuenta
  if (tx.type === "gasto" && tx.categoryId) {
    await applyBudgetDelta(ctx, tx.userId, tx.categoryId, tx.month, -tx.amount, tx.currency);
  }

  // Revertir contribución a meta de ahorro (solo metas manuales)
  if (tx.type === "gasto" && tx.goalId) {
    await applyGoalDelta(ctx, tx.goalId, -tx.amount);
  }

  // Revertir pago_tarjeta: recalcular FIFO de cuotas pagadas
  if (tx.type === "pago_tarjeta" && tx.cardId) {
    await recomputeInstallmentsPaid(ctx, tx.cardId);
  }

  // Revertir pago_deuda: restaurar saldo de la deuda y eliminar el abono asociado
  if (tx.type === "pago_deuda" && tx.debtId) {
    const debt = await ctx.db.get(tx.debtId);
    if (debt) {
      await ctx.db.patch(tx.debtId, {
        currentBalance: debt.currentBalance + tx.amount,
        status: reopenedStatus(debt.status, debt.dueDate),
        updatedAt: Date.now(),
      });
    }
    const payments = await ctx.db
      .query("debtPayments")
      .withIndex("by_debt", (q) => q.eq("debtId", tx.debtId!))
      .collect();
    const linkedPayment = payments.find((p) => p.transactionId === tx._id);
    if (linkedPayment) await ctx.db.delete(linkedPayment._id);
  }

  // Revertir prestamo_cobrado: el préstamo vuelve a deber ese monto y se borra el abono
  if (tx.type === "prestamo_cobrado" && tx.loanId) {
    const loan = await ctx.db.get(tx.loanId);
    if (loan) {
      await ctx.db.patch(tx.loanId, {
        currentBalance: loan.currentBalance + tx.amount,
        status: reopenedStatus(loan.status, loan.dueDate),
        updatedAt: Date.now(),
      });
    }
    const repayments = await ctx.db
      .query("loanRepayments")
      .withIndex("by_loan", (q) => q.eq("loanId", tx.loanId!))
      .collect();
    const linkedRepayment = repayments.find((r) => r.transactionId === tx._id);
    if (linkedRepayment) await ctx.db.delete(linkedRepayment._id);
  }

  await ctx.db.delete(tx._id);
}
