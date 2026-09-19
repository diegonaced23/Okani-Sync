import { query, mutation, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getCurrentUser, getCurrentUserId } from "./lib/auth";
import { assertValidMonth } from "./lib/utils";
import { getUserRateMap, convertAmount } from "./lib/money";
import { DEFAULT_CATEGORIES } from "../src/lib/constants";

export const list = query({
  args: {
    type: v.optional(
      v.union(v.literal("ingreso"), v.literal("gasto"), v.literal("ambos"))
    ),
  },
  handler: async (ctx, { type }) => {
    const clerkId = await getCurrentUserId(ctx);
    let results;
    if (type) {
      results = await ctx.db
        .query("categories")
        .withIndex("by_user_type", (q) =>
          q.eq("userId", clerkId).eq("type", type)
        )
        .filter((q) => q.eq(q.field("archived"), false))
        .collect();
    } else {
      results = await ctx.db
        .query("categories")
        .withIndex("by_user_archived", (q) =>
          q.eq("userId", clerkId).eq("archived", false)
        )
        .collect();
    }
    return results.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    type: v.union(v.literal("ingreso"), v.literal("gasto"), v.literal("ambos")),
    color: v.string(),
    icon: v.string(),
    parentId: v.optional(v.id("categories")),
  },
  handler: async (ctx, args) => {
    if (!/^#[0-9A-Fa-f]{6}$/.test(args.color)) throw new Error("El color debe ser un hex válido (#RRGGBB)");
    const user = await getCurrentUser(ctx);
    const now = Date.now();
    const existing = await ctx.db
      .query("categories")
      .withIndex("by_user_archived", (q) =>
        q.eq("userId", user.clerkId).eq("archived", false)
      )
      .collect();
    const maxOrder = existing.reduce((max, c) => Math.max(max, c.order ?? -1), -1);
    return await ctx.db.insert("categories", {
      userId: user.clerkId,
      name: args.name,
      type: args.type,
      color: args.color,
      icon: args.icon,
      parentId: args.parentId,
      isDefault: false,
      archived: false,
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    categoryId: v.id("categories"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
  },
  handler: async (ctx, { categoryId, ...fields }) => {
    if (fields.color !== undefined && !/^#[0-9A-Fa-f]{6}$/.test(fields.color)) throw new Error("El color debe ser un hex válido (#RRGGBB)");
    const user = await getCurrentUser(ctx);
    const cat = await ctx.db.get(categoryId);
    if (!cat || cat.userId !== user.clerkId) {
      throw new Error("Categoría no encontrada");
    }
    if (cat.isSystem) throw new Error("Las categorías del sistema no se pueden editar");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) patch[k] = v;
    }
    await ctx.db.patch(categoryId, patch);
  },
});

export const archive = mutation({
  args: { categoryId: v.id("categories") },
  handler: async (ctx, { categoryId }) => {
    const user = await getCurrentUser(ctx);
    const cat = await ctx.db.get(categoryId);
    if (!cat || cat.userId !== user.clerkId) {
      throw new Error("Categoría no encontrada");
    }
    if (cat.isSystem) throw new Error("Las categorías del sistema no se pueden archivar");
    await ctx.db.patch(categoryId, { archived: true, updatedAt: Date.now() });
  },
});

export const reorder = mutation({
  args: {
    categoryIds: v.array(v.id("categories")),
  },
  handler: async (ctx, { categoryIds }) => {
    const user = await getCurrentUser(ctx);
    const now = Date.now();
    // Las categorías "ambos" aparecen en las pestañas de gastos y de ingresos, y
    // cada pestaña manda solo sus ids. Numerar desde 0 pisaría el orden de la otra
    // pestaña (dos filas con el mismo `order`). En su lugar se reparten entre estas
    // filas los mismos valores que ya ocupaban: la otra pestaña no se entera.
    const active = await ctx.db
      .query("categories")
      .withIndex("by_user_archived", (q) =>
        q.eq("userId", user.clerkId).eq("archived", false)
      )
      .take(500);
    const byId = new Map(active.map((c) => [c._id as string, c]));
    for (const id of categoryIds) {
      if (!byId.has(id)) throw new Error("Categoría no encontrada");
    }

    // Con órdenes faltantes o repetidos no hay "huecos" fiables que repartir:
    // primero se normaliza todo el listado a 0..N-1 conservando el orden visible.
    const orders = active.map((c) => c.order);
    const clean =
      orders.every((o) => o !== undefined) && new Set(orders).size === orders.length;
    const orderOf = new Map<string, number>();
    if (clean) {
      for (const c of active) orderOf.set(c._id, c.order!);
    } else {
      const sorted = [...active].sort(
        (a, b) =>
          (a.order ?? Infinity) - (b.order ?? Infinity) || a._creationTime - b._creationTime
      );
      sorted.forEach((c, i) => orderOf.set(c._id, i));
    }

    const slots = categoryIds.map((id) => orderOf.get(id)!).sort((a, b) => a - b);
    categoryIds.forEach((id, i) => orderOf.set(id, slots[i]));

    for (const c of active) {
      const order = orderOf.get(c._id)!;
      if (c.order !== order) await ctx.db.patch(c._id, { order, updatedAt: now });
    }
  },
});

export const listArchived = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await getCurrentUserId(ctx);
    const results = await ctx.db
      .query("categories")
      .withIndex("by_user_archived", (q) =>
        q.eq("userId", clerkId).eq("archived", true)
      )
      .collect();
    return results;
  },
});

/** Devuelve una categoría archivada a la lista activa. */
export const unarchive = mutation({
  args: { categoryId: v.id("categories") },
  handler: async (ctx, { categoryId }) => {
    const user = await getCurrentUser(ctx);
    const cat = await ctx.db.get(categoryId);
    if (!cat || cat.userId !== user.clerkId) {
      throw new Error("Categoría no encontrada");
    }
    if (!cat.archived) return;
    const active = await ctx.db
      .query("categories")
      .withIndex("by_user_archived", (q) =>
        q.eq("userId", user.clerkId).eq("archived", false)
      )
      .take(500);
    // Si su posición sigue libre (p. ej. "Deshacer" justo después de archivar)
    // vuelve a su lugar; si otra fila la ocupó, va al final.
    const taken = cat.order === undefined || active.some((c) => c.order === cat.order);
    const maxOrder = active.reduce((max, c) => Math.max(max, c.order ?? -1), -1);
    await ctx.db.patch(categoryId, {
      archived: false,
      order: taken ? maxOrder + 1 : cat.order,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Agrega las categorías por defecto de un tipo que el usuario no tenga activas. Idempotente:
 * compara por nombre sin distinguir mayúsculas, y si una está archivada la restaura
 * en vez de duplicarla. Las del sistema no se tocan (se crean con el usuario).
 */
export const seedDefaults = mutation({
  args: { type: v.union(v.literal("gasto"), v.literal("ingreso")) },
  handler: async (ctx, { type }) => {
    const user = await getCurrentUser(ctx);
    const now = Date.now();
    const all = await ctx.db
      .query("categories")
      .withIndex("by_user", (q) => q.eq("userId", user.clerkId))
      .take(1000);
    // Si hay una activa y otra archivada con el mismo nombre, manda la activa
    const byName = new Map<string, (typeof all)[number]>();
    for (const c of all) {
      const key = c.name.trim().toLowerCase();
      const prev = byName.get(key);
      if (!prev || (prev.archived && !c.archived)) byName.set(key, c);
    }
    let order = all
      .filter((c) => !c.archived)
      .reduce((max, c) => Math.max(max, c.order ?? -1), -1);

    let added = 0;
    for (const def of DEFAULT_CATEGORIES) {
      if (def.type !== type) continue;
      const existing = byName.get(def.name.toLowerCase());
      if (existing && !existing.archived) continue;
      order += 1;
      added += 1;
      if (existing) {
        await ctx.db.patch(existing._id, { archived: false, order, updatedAt: now });
      } else {
        await ctx.db.insert("categories", {
          userId: user.clerkId,
          name: def.name,
          type: def.type,
          color: def.color,
          icon: def.icon,
          isDefault: true,
          archived: false,
          order,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    return { added };
  },
});

/**
 * Total y cantidad de movimientos del mes por categoría, en la moneda preferida.
 * Gastos en base devengo (gasto + gasto_tarjeta), igual que spendingByCategory,
 * e ingresos aparte.
 */
export const monthStats = query({
  args: { month: v.string() },
  handler: async (ctx, { month }) => {
    assertValidMonth(month);
    const user = await getCurrentUser(ctx);
    const { rateMap, preferredCurrency } = await getUserRateMap(ctx, user);

    const byType = (type: "gasto" | "gasto_tarjeta" | "ingreso") =>
      ctx.db
        .query("transactions")
        .withIndex("by_user_type_month", (q) =>
          q.eq("userId", user.clerkId).eq("type", type).eq("month", month)
        )
        .take(2000);
    const [gastos, gastosTarjeta, ingresos] = await Promise.all([
      byType("gasto"),
      byType("gasto_tarjeta"),
      byType("ingreso"),
    ]);

    // Gasto e ingreso por separado: una categoría "ambos" muestra en cada pestaña su lado
    type Entry = { expense: number; income: number; count: number };
    const stats: Record<Id<"categories">, Entry> = {};
    const add = (txs: typeof gastos, side: "expense" | "income") => {
      for (const tx of txs) {
        if (!tx.categoryId) continue;
        // Sin tasa disponible se excluye del monto en vez de sumarlo sin convertir
        const { converted, hasRate } = convertAmount(tx.amount, tx.currency, preferredCurrency, rateMap);
        const entry = (stats[tx.categoryId] ??= { expense: 0, income: 0, count: 0 });
        entry[side] += hasRate ? converted : 0;
        entry.count += 1;
      }
    };
    add(gastos, "expense");
    add(gastosTarjeta, "expense");
    add(ingresos, "income");
    return { currency: preferredCurrency, stats };
  },
});

export const transactionCount = query({
  args: { categoryId: v.id("categories") },
  handler: async (ctx, { categoryId }) => {
    const clerkId = await getCurrentUserId(ctx);
    const cat = await ctx.db.get(categoryId);
    if (!cat || cat.userId !== clerkId) return 0;
    const txs = await ctx.db
      .query("transactions")
      .withIndex("by_user_category_month", (q) =>
        q.eq("userId", clerkId).eq("categoryId", categoryId)
      )
      .take(501);
    return txs.length;
  },
});

export const remove = mutation({
  args: { categoryId: v.id("categories") },
  handler: async (ctx, { categoryId }) => {
    const user = await getCurrentUser(ctx);
    const cat = await ctx.db.get(categoryId);
    if (!cat || cat.userId !== user.clerkId) throw new Error("Categoría no encontrada");
    if (cat.isSystem) throw new Error("Las categorías del sistema no se pueden eliminar");
    if (!cat.archived) throw new Error("Solo se pueden eliminar categorías archivadas");

    const existingTx = await ctx.db
      .query("transactions")
      .withIndex("by_user_category_month", (q) =>
        q.eq("userId", user.clerkId).eq("categoryId", categoryId)
      )
      .take(1);
    if (existingTx.length > 0) {
      throw new Error("La categoría tiene transacciones — migrá los movimientos antes de eliminar");
    }

    const now = Date.now();

    // Desvincula transacciones recurrentes
    const recurrings = await ctx.db
      .query("recurringTransactions")
      .withIndex("by_user", (q) => q.eq("userId", user.clerkId))
      .filter((q) => q.eq(q.field("categoryId"), categoryId))
      .collect();
    for (const rt of recurrings) {
      await ctx.db.patch(rt._id, { categoryId: undefined, updatedAt: now });
    }

    // Elimina presupuestos asociados
    const budgets = await ctx.db
      .query("budgets")
      .withIndex("by_user_category_month", (q) =>
        q.eq("userId", user.clerkId).eq("categoryId", categoryId)
      )
      .collect();
    for (const budget of budgets) {
      await ctx.db.delete(budget._id);
    }

    await ctx.db.delete(categoryId);
  },
});

type CategoryType = "ingreso" | "gasto" | "ambos";

function isTypeCompatible(sourceType: CategoryType, targetType: CategoryType): boolean {
  if (sourceType === "ambos") return true;
  return targetType === sourceType || targetType === "ambos";
}

export const migrateAndDelete = mutation({
  args: {
    categoryId: v.id("categories"),
    targetCategoryId: v.id("categories"),
  },
  handler: async (ctx, { categoryId, targetCategoryId }) => {
    const user = await getCurrentUser(ctx);
    const cat = await ctx.db.get(categoryId);
    if (!cat || cat.userId !== user.clerkId) throw new Error("Categoría no encontrada");
    if (!cat.archived) throw new Error("Solo se pueden eliminar categorías archivadas");
    if (categoryId === targetCategoryId) throw new Error("La categoría destino debe ser diferente");

    const targetCat = await ctx.db.get(targetCategoryId);
    if (!targetCat || targetCat.userId !== user.clerkId || targetCat.archived) {
      throw new Error("Categoría destino no válida");
    }
    if (!isTypeCompatible(cat.type, targetCat.type)) {
      throw new Error("El tipo de la categoría destino no es compatible");
    }

    const now = Date.now();
    const txBatch = await ctx.db
      .query("transactions")
      .withIndex("by_user_category_month", (q) =>
        q.eq("userId", user.clerkId).eq("categoryId", categoryId)
      )
      .take(100);

    for (const tx of txBatch) {
      await ctx.db.patch(tx._id, { categoryId: targetCategoryId, updatedAt: now });
    }

    if (txBatch.length === 100) {
      await ctx.scheduler.runAfter(0, internal.categories.continueMigrate, {
        categoryId,
        targetCategoryId,
        userId: user.clerkId,
      });
      return { willContinue: true };
    }

    await _cleanup(ctx, categoryId, targetCategoryId, user.clerkId, now);
    return { willContinue: false };
  },
});

export const continueMigrate = internalMutation({
  args: {
    categoryId: v.id("categories"),
    targetCategoryId: v.id("categories"),
    userId: v.string(),
  },
  handler: async (ctx, { categoryId, targetCategoryId, userId }) => {
    const now = Date.now();
    const txBatch = await ctx.db
      .query("transactions")
      .withIndex("by_user_category_month", (q) =>
        q.eq("userId", userId).eq("categoryId", categoryId)
      )
      .take(100);

    for (const tx of txBatch) {
      await ctx.db.patch(tx._id, { categoryId: targetCategoryId, updatedAt: now });
    }

    if (txBatch.length === 100) {
      await ctx.scheduler.runAfter(0, internal.categories.continueMigrate, {
        categoryId, targetCategoryId, userId,
      });
      return;
    }

    await _cleanup(ctx, categoryId, targetCategoryId, userId, now);
  },
});

async function _cleanup(
  ctx: MutationCtx,
  categoryId: Id<"categories">,
  targetCategoryId: Id<"categories">,
  userId: string,
  now: number
) {
  const recurrings = await ctx.db
    .query("recurringTransactions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .filter((q) => q.eq(q.field("categoryId"), categoryId))
    .collect();
  for (const rt of recurrings) {
    await ctx.db.patch(rt._id, { categoryId: targetCategoryId, updatedAt: now });
  }

  const budgets = await ctx.db
    .query("budgets")
    .withIndex("by_user_category_month", (q) =>
      q.eq("userId", userId).eq("categoryId", categoryId)
    )
    .collect();
  for (const budget of budgets) {
    await ctx.db.delete(budget._id);
  }

  await ctx.db.delete(categoryId);
}
