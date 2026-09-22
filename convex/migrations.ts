/**
 * Migraciones de datos — se ejecutan desde el Convex Dashboard o CLI.
 *
 *   # Ensayo: no escribe nada, devuelve qué haría con un lote de tarjetas
 *   npx convex run migrations:migrateCardInterestModel '{"dryRun": true}'
 *   # De verdad: recorre todas las tarjetas por lotes y luego las categorías
 *   npx convex run migrations:migrateCardInterestModel
 *   npx convex run migrations:normalizeInvitationEmails
 *
 * Todas son idempotentes: se pueden correr más de una vez sin duplicar datos.
 *
 * Las migraciones de tarjetas de modelos anteriores (crear un gasto_tarjeta por
 * cuota, consolidar pagos antiguos, crear las categorías de sistema) se quitaron:
 * ya se corrieron, y volver a correrlas sobre el modelo actual rompería datos
 * (la primera, por ejemplo, recrearía con el interés incluido las cuotas que aún
 * no se han facturado).
 */
import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { normalizeEmail } from "../src/lib/email";
import { applyBudgetDelta } from "./lib/transactionEffects";
import { recomputeInstallmentsPaid } from "./lib/cardHelpers";
import { ensureInterestCategory } from "./lib/cardBilling";
import { getLegacyInterestsCategoryId } from "./lib/utils";

// ─── Tarjetas: modelo de intereses al facturar (fase 3) ──────────────────────
//
// Antes: la deuda subía por la cuota entera (capital + interés de todo el plazo)
// al comprar, y cada cuota tenía desde el principio un gasto_tarjeta por la cuota
// entera, con fecha futura. Ahora: la deuda sube por el capital, y cada cuota se
// factura en su corte con dos movimientos, capital e interés (lib/cardBilling.ts).
//
// Por cada cuota sin migrar (sin `interestBilling`):
// - Ya facturada (su fecha pasó) o ya pagada: su gasto_tarjeta se queda con el
//   capital y se crea el movimiento de interés. La deuda no cambia: ese interés
//   ya estaba en ella. Una cuota futura ya pagada se trata como facturada porque
//   el usuario ya pagó su interés.
// - Pendiente: se borra su gasto_tarjeta futuro (lo creará el cron en su corte),
//   se devuelve lo que sumó al presupuesto y se RESTA su interés de la deuda,
//   porque el banco aún no lo ha cobrado.
// Luego se reparten los pagos (paidAmount) y a los pagos de la tarjeta se les
// quita la categoría «Pago de tarjeta».

type CardReport = {
  cardId: Id<"cards">;
  installments: number;
  billed: number;
  pending: number;
  interestRemoved: number;
  balanceBefore: number;
  balanceAfter: number;
  /** false si el saldo quedaría negativo y se recortó a 0: revisar a mano. */
  consistent: boolean;
};

async function migrateCard(ctx: MutationCtx, card: Doc<"cards">, now: number, dryRun: boolean): Promise<CardReport> {
  const installments = (
    await ctx.db
      .query("cardInstallments")
      .withIndex("by_card_month", (q) => q.eq("cardId", card._id))
      .collect()
  ).filter((i) => i.interestBilling === undefined);

  const legacyInterestsCat = await getLegacyInterestsCategoryId(ctx, card.userId);
  const interestCat = dryRun ? legacyInterestsCat : await ensureInterestCategory(ctx, card.userId, card);
  const purchases = new Map<Id<"cardPurchases">, Doc<"cardPurchases"> | null>();

  let billed = 0;
  let pending = 0;
  let interestRemoved = 0;

  for (const inst of installments) {
    if (!purchases.has(inst.purchaseId)) purchases.set(inst.purchaseId, await ctx.db.get(inst.purchaseId));
    const purchase = purchases.get(inst.purchaseId) ?? null;

    const principal = inst.principalAmount ?? inst.amount;
    const interest = inst.principalAmount === undefined ? 0 : (inst.interestAmount ?? 0);
    // Dónde puso el modelo anterior el interés en el presupuesto: en la categoría
    // de sistema si existía; si no, junto al capital en la categoría de la compra.
    const interestInSystemCat = !!(purchase?.hasInterest && legacyInterestsCat);

    const txs = await ctx.db
      .query("transactions")
      .withIndex("by_card_installment", (q) => q.eq("cardId", card._id).eq("cardInstallmentId", inst._id))
      .collect();
    const cuotaTx = txs.find((t) => t.cardChargeKind === undefined);
    const isBilled = inst.dueDate <= now || inst.paid;

    if (isBilled) {
      billed++;
      if (dryRun) continue;
      if (cuotaTx) {
        await ctx.db.patch(cuotaTx._id, { amount: principal, cardChargeKind: "cuota", updatedAt: now });
        if (interest > 0 && interestCat && !txs.some((t) => t.cardChargeKind === "interes")) {
          await ctx.db.insert("transactions", {
            userId: card.userId,
            type: "gasto_tarjeta",
            cardChargeKind: "interes",
            amount: interest,
            description: `Intereses — ${cuotaTx.description}`,
            date: cuotaTx.date,
            month: cuotaTx.month,
            currency: cuotaTx.currency,
            cardId: card._id,
            cardInstallmentId: inst._id,
            cardPurchaseId: inst.purchaseId,
            categoryId: interestCat,
            status: "completada",
            isRecurring: false,
            createdAt: now,
            updatedAt: now,
          });
          // El interés ya estaba en el presupuesto: solo se mueve si no estaba en
          // la categoría de intereses (usuarios sin la de sistema)
          if (!interestInSystemCat) {
            if (cuotaTx.categoryId) {
              await applyBudgetDelta(ctx, card.userId, cuotaTx.categoryId, cuotaTx.month, -interest, cuotaTx.currency);
            }
            await applyBudgetDelta(ctx, card.userId, interestCat, cuotaTx.month, interest, cuotaTx.currency);
          }
        }
      }
      await ctx.db.patch(inst._id, { interestBilling: "at_cutoff", billedAt: now, transactionId: cuotaTx?._id });
    } else {
      pending++;
      interestRemoved += interest;
      if (dryRun) continue;
      if (cuotaTx) {
        // Devolver lo que sumó al presupuesto, como lo sumó el modelo anterior
        if (cuotaTx.categoryId) {
          const fromCategory = interestInSystemCat ? principal : cuotaTx.amount;
          await applyBudgetDelta(ctx, card.userId, cuotaTx.categoryId, cuotaTx.month, -fromCategory, cuotaTx.currency);
        }
        if (interestInSystemCat && interest > 0) {
          await applyBudgetDelta(ctx, card.userId, legacyInterestsCat!, cuotaTx.month, -interest, cuotaTx.currency);
        }
        await ctx.db.delete(cuotaTx._id);
      }
      await ctx.db.patch(inst._id, { interestBilling: "at_cutoff", transactionId: undefined });
    }
  }

  const expected = card.currentBalance - interestRemoved;
  const balanceAfter = Math.max(0, expected);
  if (!dryRun) {
    if (interestRemoved > 0) {
      await ctx.db.patch(card._id, {
        currentBalance: balanceAfter,
        availableCredit: Math.max(0, card.creditLimit - balanceAfter),
        updatedAt: now,
      });
    }
    await recomputeInstallmentsPaid(ctx, card._id);

    // Pagar la tarjeta no es un gasto: sin categoría
    const payments = await ctx.db
      .query("transactions")
      .withIndex("by_card", (q) => q.eq("cardId", card._id))
      .filter((q) => q.eq(q.field("type"), "pago_tarjeta"))
      .collect();
    for (const p of payments) {
      if (p.categoryId) await ctx.db.patch(p._id, { categoryId: undefined, updatedAt: now });
    }
  }

  return {
    cardId: card._id,
    installments: installments.length,
    billed,
    pending,
    interestRemoved,
    balanceBefore: card.currentBalance,
    balanceAfter,
    consistent: expected === balanceAfter,
  };
}

export const migrateCardInterestModel = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    dryRun: v.optional(v.boolean()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, { cursor = null, dryRun = false, batchSize = 3 }) => {
    const now = Date.now();
    const page = await ctx.db.query("cards").order("asc").paginate({ cursor, numItems: batchSize });

    const reports: CardReport[] = [];
    for (const card of page.page) {
      const report = await migrateCard(ctx, card, now, dryRun);
      reports.push(report);
      console.log(`migrateCardInterestModel${dryRun ? " (ensayo)" : ""}: ${JSON.stringify(report)}`);
    }

    // En ensayo no se encadena: quien lo corre ve el lote y decide
    if (!dryRun) {
      if (!page.isDone) {
        await ctx.scheduler.runAfter(0, internal.migrations.migrateCardInterestModel, {
          cursor: page.continueCursor,
          batchSize,
        });
      } else {
        await ctx.scheduler.runAfter(0, internal.migrations.migrateLegacySystemCategories, {});
      }
    }

    return {
      dryRun,
      reports,
      inconsistent: reports.filter((r) => !r.consistent).map((r) => r.cardId),
      isDone: page.isDone,
      nextCursor: page.isDone ? null : page.continueCursor,
    };
  },
});

/**
 * Último paso: las categorías de sistema dejan de serlo.
 * - «Gastos financieros» pasa a ser una categoría normal (editable, archivable).
 * - «Pago de tarjeta» se elimina: pagar la tarjeta no es un gasto. Sus
 *   presupuestos (que nunca podían sumar nada) se borran y las recurrentes que la
 *   usaran quedan sin categoría. Si algún gasto normal la tiene —el fallo que la
 *   fase 1 cerró—, se conserva como categoría normal para no tocar ese gasto.
 */
export const migrateLegacySystemCategories = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor = null }) => {
    const page = await ctx.db.query("users").order("asc").paginate({ cursor, numItems: 20 });
    const now = Date.now();
    let interestsConverted = 0;
    let paymentDeleted = 0;
    let paymentKept = 0;

    for (const user of page.page) {
      const system = await ctx.db
        .query("categories")
        .withIndex("by_user", (q) => q.eq("userId", user.clerkId))
        .filter((q) => q.eq(q.field("isSystem"), true))
        .collect();

      for (const cat of system) {
        if (cat.name !== "Pago de tarjeta") {
          await ctx.db.patch(cat._id, { isSystem: undefined, isDefault: true, updatedAt: now });
          interestsConverted++;
          continue;
        }

        const refs = await ctx.db
          .query("transactions")
          .withIndex("by_user_category_month", (q) => q.eq("userId", user.clerkId).eq("categoryId", cat._id))
          .collect();
        let otherRefs = 0;
        for (const tx of refs) {
          if (tx.type === "pago_tarjeta") await ctx.db.patch(tx._id, { categoryId: undefined, updatedAt: now });
          else otherRefs++;
        }

        const budgets = await ctx.db
          .query("budgets")
          .withIndex("by_user_category_month", (q) => q.eq("userId", user.clerkId).eq("categoryId", cat._id))
          .collect();
        for (const b of budgets) await ctx.db.delete(b._id);

        const recurring = await ctx.db
          .query("recurringTransactions")
          .withIndex("by_user", (q) => q.eq("userId", user.clerkId))
          .collect();
        for (const r of recurring) {
          if (r.categoryId === cat._id) await ctx.db.patch(r._id, { categoryId: undefined, updatedAt: now });
        }

        if (otherRefs > 0) {
          await ctx.db.patch(cat._id, { isSystem: undefined, updatedAt: now });
          paymentKept++;
        } else {
          await ctx.db.delete(cat._id);
          paymentDeleted++;
        }
      }
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.migrateLegacySystemCategories, {
        cursor: page.continueCursor,
      });
    }
    console.log(
      `migrateLegacySystemCategories: ${JSON.stringify({ interestsConverted, paymentDeleted, paymentKept, isDone: page.isDone })}`
    );
    return { interestsConverted, paymentDeleted, paymentKept, isDone: page.isDone };
  },
});

/**
 * Pasa a minúsculas el correo de las invitaciones ya guardadas.
 *
 * Sin esto, una invitación creada antes del arreglo con mayúsculas distintas a
 * las del proveedor de identidad sigue sin poder encontrarse, y su titular
 * sigue sin poder entrar. Idempotente: las que ya están normalizadas no se tocan.
 */
export const normalizeInvitationEmails = internalMutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("invitations").collect();
    let changed = 0;
    for (const inv of all) {
      const normalized = normalizeEmail(inv.email);
      if (normalized === inv.email) continue;
      await ctx.db.patch(inv._id, { email: normalized });
      changed++;
    }
    return { total: all.length, changed };
  },
});
