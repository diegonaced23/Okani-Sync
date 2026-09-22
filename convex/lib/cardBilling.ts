import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { toMonthString } from "./utils";
import { applyBudgetDelta, applyCardDelta } from "./transactionEffects";
import { INTEREST_CATEGORY } from "../../src/lib/constants";
import { recomputeInstallmentsPaid } from "./cardHelpers";

/**
 * Facturación de cuotas de tarjeta (fase 3 del rediseño, ver
 * docs/propuesta-tarjetas-credito.md).
 *
 * La deuda sube por el CAPITAL al comprar. Cada cuota se «factura» cuando llega
 * su `dueDate` (el corte en que entra al extracto; ver `cardSchedule.ts`): en ese
 * momento se registra su gasto (el capital, en la categoría de la compra) y su
 * interés (en la categoría de intereses de la tarjeta), y el interés se suma a la
 * deuda. Así adelantar un pago no paga intereses que el banco aún no cobra.
 */

/** Descripción de una cuota en movimientos: «TV — Cuota 2/3». */
export function cuotaDescription(purchase: Pick<Doc<"cardPurchases">, "description" | "totalInstallments">, n: number) {
  return purchase.totalInstallments > 1
    ? `${purchase.description} — Cuota ${n}/${purchase.totalInstallments}`
    : purchase.description;
}

/**
 * La categoría de intereses de la tarjeta. Se guarda por id en
 * `cards.interestCategoryId`; si falta (tarjetas creadas antes de la fase 3) o
 * la categoría ya no existe, se resuelve UNA vez y se guarda:
 * 1. la categoría de sistema «Gastos financieros» del modelo anterior, que es
 *    donde ya están los presupuestos de intereses del usuario;
 * 2. una categoría de gasto con ese nombre;
 * 3. si no hay ninguna, se crea.
 */
export async function ensureInterestCategory(
  ctx: MutationCtx,
  userId: string,
  card?: Doc<"cards">
): Promise<Id<"categories">> {
  if (card?.interestCategoryId) {
    const existing = await ctx.db.get(card.interestCategoryId);
    if (existing) return existing._id;
  }

  const cats = await ctx.db
    .query("categories")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const found =
    cats.find((c) => c.isSystem && c.name === INTEREST_CATEGORY.name) ??
    cats.find((c) => !c.archived && c.type !== "ingreso" && c.name === INTEREST_CATEGORY.name);

  let id = found?._id;
  if (!id) {
    const now = Date.now();
    id = await ctx.db.insert("categories", {
      userId,
      name: INTEREST_CATEGORY.name,
      type: INTEREST_CATEGORY.type,
      color: INTEREST_CATEGORY.color,
      icon: INTEREST_CATEGORY.icon,
      isDefault: true,
      archived: false,
      createdAt: now,
      updatedAt: now,
    });
  }
  if (card && card.interestCategoryId !== id) {
    await ctx.db.patch(card._id, { interestCategoryId: id });
  }
  return id;
}

/**
 * Registra el GASTO de una cuota, en su fecha de gasto (`expenseDate`: el día de
 * la compra más un mes por cuota). Es lo que hace que una compra del 20 de
 * septiembre salga en septiembre, aunque su extracto cierre en octubre.
 *
 * El capital ya entró a la deuda al comprar: aquí solo se crea el movimiento y se
 * suma al presupuesto de su mes.
 *
 * Idempotente en dos capas, para que el cron pueda correr cuantas veces sea:
 * una cuota con `expensedAt` ya se registró, y si ya existe su movimiento no se
 * crea otro (p. ej. una ejecución que se cortó a medias).
 */
export async function expenseInstallment(
  ctx: MutationCtx,
  args: {
    inst: Doc<"cardInstallments">;
    purchase: Doc<"cardPurchases">;
    card: Doc<"cards">;
    now: number;
    recurringId?: Id<"recurringTransactions">;
  }
): Promise<void> {
  const { inst, purchase, card, now, recurringId } = args;
  if (inst.expensedAt !== undefined || inst.interestBilling !== "at_cutoff") return;

  const existing = await ctx.db
    .query("transactions")
    .withIndex("by_card_installment", (q) => q.eq("cardId", card._id).eq("cardInstallmentId", inst._id))
    .collect();
  const cuotaTx = existing.find((t) => t.cardChargeKind !== "interes");

  const principal = inst.principalAmount ?? inst.amount;
  const date = inst.expenseDate ?? inst.dueDate;
  const month = toMonthString(date);

  let cuotaTxId = cuotaTx?._id;
  if (!cuotaTx) {
    cuotaTxId = await ctx.db.insert("transactions", {
      userId: card.userId,
      type: "gasto_tarjeta",
      cardChargeKind: "cuota",
      amount: principal,
      description: cuotaDescription(purchase, inst.installmentNumber),
      date,
      month,
      currency: card.currency,
      cardId: card._id,
      cardInstallmentId: inst._id,
      cardPurchaseId: purchase._id,
      categoryId: purchase.categoryId,
      status: "completada",
      isRecurring: recurringId !== undefined,
      recurringId,
      createdAt: now,
      updatedAt: now,
    });
    if (purchase.categoryId) {
      await applyBudgetDelta(ctx, card.userId, purchase.categoryId, month, principal, card.currency);
    }
  }

  await ctx.db.patch(inst._id, { expensedAt: now, transactionId: cuotaTxId });
}

/**
 * Cobra el INTERÉS de una cuota cuando entra al extracto, en el corte
 * (`dueDate`). El interés se suma a la deuda en ese momento, no antes: así
 * adelantar un pago no paga intereses que el banco todavía no cobró.
 *
 * El movimiento del interés lleva la fecha del corte, que es cuando el banco lo
 * cobra, aunque el capital de la cuota sea gasto de otro mes.
 *
 * Idempotente igual que `expenseInstallment`: `billedAt`, y si ya existe el
 * movimiento de interés no se crea otro.
 */
export async function chargeInstallmentInterest(
  ctx: MutationCtx,
  args: { inst: Doc<"cardInstallments">; purchase: Doc<"cardPurchases">; card: Doc<"cards">; now: number }
): Promise<void> {
  const { inst, purchase, card, now } = args;
  if (inst.billedAt !== undefined || inst.interestBilling !== "at_cutoff") return;

  const interest = inst.principalAmount === undefined ? 0 : (inst.interestAmount ?? 0);
  if (interest > 0) {
    const existing = await ctx.db
      .query("transactions")
      .withIndex("by_card_installment", (q) => q.eq("cardId", card._id).eq("cardInstallmentId", inst._id))
      .collect();
    if (!existing.some((t) => t.cardChargeKind === "interes")) {
      const month = toMonthString(inst.dueDate);
      const interestCategoryId = await ensureInterestCategory(ctx, card.userId, card);
      await ctx.db.insert("transactions", {
        userId: card.userId,
        type: "gasto_tarjeta",
        cardChargeKind: "interes",
        amount: interest,
        description: `Intereses — ${cuotaDescription(purchase, inst.installmentNumber)}`,
        date: inst.dueDate,
        month,
        currency: card.currency,
        cardId: card._id,
        cardInstallmentId: inst._id,
        cardPurchaseId: purchase._id,
        categoryId: interestCategoryId,
        status: "completada",
        isRecurring: false,
        createdAt: now,
        updatedAt: now,
      });
      await applyBudgetDelta(ctx, card.userId, interestCategoryId, month, interest, card.currency);
      await applyCardDelta(ctx, card._id, interest);
    }
  }

  await ctx.db.patch(inst._id, { billedAt: now });
}

/**
 * Pone al día una tarjeta: registra los gastos de las cuotas cuya fecha ya pasó y
 * cobra los intereses de las que ya entraron al extracto. Luego reparte los pagos.
 */
export async function billDueInstallmentsForCard(ctx: MutationCtx, cardId: Id<"cards">, now: number) {
  const installments = await ctx.db
    .query("cardInstallments")
    .withIndex("by_card_month", (q) => q.eq("cardId", cardId))
    .collect();
  const pendientes = installments.filter(
    (i) =>
      i.interestBilling === "at_cutoff" &&
      ((i.expensedAt === undefined && (i.expenseDate ?? i.dueDate) <= now) ||
        (i.billedAt === undefined && i.dueDate <= now))
  );
  if (pendientes.length === 0) return;

  const purchases = new Map<Id<"cardPurchases">, Doc<"cardPurchases"> | null>();
  for (const inst of pendientes) {
    if (!purchases.has(inst.purchaseId)) purchases.set(inst.purchaseId, await ctx.db.get(inst.purchaseId));
    const purchase = purchases.get(inst.purchaseId);
    // Cada cuota relee la tarjeta y la cuota: la anterior pudo sumarle interés a
    // la deuda, y registrar el gasto deja marca en la cuota.
    const card = await ctx.db.get(cardId);
    if (!card) return;
    if (!purchase) {
      // Cuota huérfana: sin marcarla, el cron la volvería a leer en cada ejecución
      await ctx.db.patch(inst._id, { expensedAt: now, billedAt: now });
      continue;
    }
    if ((inst.expenseDate ?? inst.dueDate) <= now) {
      await expenseInstallment(ctx, { inst, purchase, card, now });
    }
    if (inst.dueDate <= now) {
      const fresh = (await ctx.db.get(inst._id))!;
      const freshCard = (await ctx.db.get(cardId))!;
      await chargeInstallmentInterest(ctx, { inst: fresh, purchase, card: freshCard, now });
    }
  }
  await recomputeInstallmentsPaid(ctx, cardId);
}
