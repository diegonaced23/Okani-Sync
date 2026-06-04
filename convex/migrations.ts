/**
 * Migraciones de datos — se ejecutan una sola vez desde el Convex Dashboard o CLI:
 *   npx convex run migrations:migrateCardPurchasesToGastoTarjeta
 *   npx convex run migrations:ensureSystemCategories
 *   npx convex run migrations:consolidateLegacyPayments
 *
 * Todas las funciones son idempotentes: se pueden correr más de una vez sin duplicar datos.
 */
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

const SYSTEM_CATEGORIES = [
  { name: "Pago de tarjeta",   type: "gasto" as const, color: "#F97316", icon: "credit-card" },
  { name: "Gastos financieros", type: "gasto" as const, color: "#6366F1", icon: "percent"     },
];

// ─── Crear/actualizar categorías de sistema para todos los usuarios ───────────
// Idempotente: comprueba cada categoría por nombre antes de insertar.
// Ejecutar cada vez que se añada una nueva categoría de sistema.

export const ensureSystemCategories = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    let created = 0;

    for (const user of users) {
      for (const sysCat of SYSTEM_CATEGORIES) {
        const existing = await ctx.db
          .query("categories")
          .withIndex("by_user", (q) => q.eq("userId", user.clerkId))
          .filter((q) =>
            q.and(q.eq(q.field("isSystem"), true), q.eq(q.field("name"), sysCat.name))
          )
          .first();

        if (!existing) {
          const now = Date.now();
          await ctx.db.insert("categories", {
            userId: user.clerkId,
            name: sysCat.name,
            type: sysCat.type,
            color: sysCat.color,
            icon: sysCat.icon,
            isDefault: false,
            isSystem: true,
            archived: false,
            createdAt: now,
            updatedAt: now,
          });
          created++;
        }
      }
    }

    return { usersProcessed: users.length, categoriesCreated: created };
  },
});

// ─── Paso 2: Generar gasto_tarjeta para cada cardInstallment sin tx asociada ──

export const migrateCardPurchasesToGastoTarjeta = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, { cursor, batchSize = 50 }) => {
    const query = ctx.db.query("cardPurchases").order("asc");
    const page = cursor
      ? await query.paginate({ cursor, numItems: batchSize })
      : await query.paginate({ cursor: null, numItems: batchSize });

    let txsCreated = 0;

    for (const purchase of page.page) {
      const installments = await ctx.db
        .query("cardInstallments")
        .withIndex("by_purchase", (q) => q.eq("purchaseId", purchase._id))
        .collect();

      for (const inst of installments) {
        // Verificar idempotencia: no crear si ya existe una gasto_tarjeta con este cardInstallmentId
        const existing = await ctx.db
          .query("transactions")
          .withIndex("by_card", (q) => q.eq("cardId", inst.cardId))
          .filter((q) => q.eq(q.field("cardInstallmentId"), inst._id))
          .filter((q) => q.eq(q.field("type"), "gasto_tarjeta"))
          .first();

        if (existing) continue;

        const desc = purchase.totalInstallments > 1
          ? `${purchase.description} — Cuota ${inst.installmentNumber}/${purchase.totalInstallments}`
          : purchase.description;

        const now = Date.now();
        await ctx.db.insert("transactions", {
          userId: purchase.userId,
          type: "gasto_tarjeta",
          amount: inst.amount,
          description: desc,
          date: inst.dueDate,
          month: inst.month,
          currency: purchase.currency,
          cardId: inst.cardId,
          cardInstallmentId: inst._id,
          cardPurchaseId: purchase._id,
          categoryId: purchase.categoryId,
          status: "completada",
          isRecurring: false,
          createdAt: now,
          updatedAt: now,
        });
        txsCreated++;
      }
    }

    return {
      txsCreated,
      isDone: page.isDone,
      nextCursor: page.isDone ? null : page.continueCursor,
    };
  },
});

// ─── Paso 3: Consolidar pago_tarjeta legacy (con cardInstallmentId) ───────────

export const consolidateLegacyPayments = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, { cursor, batchSize = 50 }) => {
    // Buscar txs pago_tarjeta que todavía tengan cardInstallmentId (son del modelo viejo)
    const query = ctx.db.query("transactions").order("asc");

    const allWithFilter = cursor
      ? await query.paginate({ cursor, numItems: batchSize * 5 })
      : await query.paginate({ cursor: null, numItems: batchSize * 5 });

    const legacyPayments = allWithFilter.page.filter(
      (tx) => tx.type === "pago_tarjeta" && tx.cardInstallmentId !== undefined
    );

    // Agrupar por (userId, cardId, month) para consolidar
    const groups = new Map<string, typeof legacyPayments>();
    for (const tx of legacyPayments) {
      const key = `${tx.userId}|${tx.cardId ?? ""}|${tx.month}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(tx);
    }

    let consolidated = 0;

    for (const [, txs] of groups) {
      if (txs.length === 0) continue;

      const totalAmount = txs.reduce((s, t) => s + t.amount, 0);
      const first = txs[0];
      const now = Date.now();

      // Buscar si ya existe un pago_tarjeta consolidado (sin cardInstallmentId) del mismo grupo
      const existingConsolidated = await ctx.db
        .query("transactions")
        .withIndex("by_card", (q) => q.eq("cardId", first.cardId!))
        .filter((q) => q.eq(q.field("type"), "pago_tarjeta"))
        .filter((q) => q.eq(q.field("month"), first.month))
        .filter((q) => q.eq(q.field("cardInstallmentId"), undefined))
        .first();

      if (!existingConsolidated) {
        // Buscar categoría sistema del usuario
        const sysCat = await ctx.db
          .query("categories")
          .withIndex("by_user", (q) => q.eq("userId", first.userId))
          .filter((q) => q.eq(q.field("isSystem"), true))
          .first();

        await ctx.db.insert("transactions", {
          userId: first.userId,
          type: "pago_tarjeta",
          amount: totalAmount,
          description: "Pago de tarjeta (histórico)",
          date: first.date,
          month: first.month,
          currency: first.currency,
          accountId: first.accountId,
          cardId: first.cardId,
          categoryId: sysCat?._id,
          status: "completada",
          isRecurring: false,
          createdAt: now,
          updatedAt: now,
        });
        consolidated++;
      }

      // Eliminar las txs antiguas con cardInstallmentId
      for (const tx of txs) {
        await ctx.db.delete(tx._id);
      }
    }

    return {
      groupsConsolidated: consolidated,
      legacyPaymentsRemoved: legacyPayments.length,
      isDone: allWithFilter.isDone,
      nextCursor: allWithFilter.isDone ? null : allWithFilter.continueCursor,
    };
  },
});
