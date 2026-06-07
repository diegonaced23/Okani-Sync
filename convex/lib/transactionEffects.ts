import type { MutationCtx } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";
import { recomputeInstallmentsPaid } from "./cardHelpers";
import { buildRateMap, convertAmount } from "./money";
import { getSystemInterestsCategoryId } from "./utils";

// ─── Helpers de delta ─────────────────────────────────────────────────────────

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
 * Alcance actual: revierte efectos sobre cuentas, tarjetas y presupuestos.
 * TODO: deudas y préstamos — `pago_deuda` no revierte `debts.currentBalance` ni
 * elimina el `debtPayments` asociado. Pendiente como mejora separada.
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
    const [outLeg, inLeg] = [...legs].sort((a, b) => a._creationTime - b._creationTime);
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

  // Revertir gasto_tarjeta: balance de tarjeta + presupuesto (split principal/interés) + cuota
  if (tx.type === "gasto_tarjeta") {
    if (tx.cardId) await applyCardDelta(ctx, tx.cardId, -tx.amount);

    // Leer la cuota antes de eliminarla para obtener el split principal/interés
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

    if (tx.categoryId) {
      await applyBudgetDelta(ctx, tx.userId, tx.categoryId, tx.month, -principalAmount, tx.currency);
    }
    if (interestAmount > 0) {
      const interestsCatId = await getSystemInterestsCategoryId(ctx, tx.userId);
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

  await ctx.db.delete(tx._id);
}
