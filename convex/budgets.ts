import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser, getCurrentUserId } from "./lib/auth";

export const listByMonth = query({
  args: { month: v.string() },
  handler: async (ctx, { month }) => {
    const clerkId = await getCurrentUserId(ctx);
    return await ctx.db
      .query("budgets")
      .withIndex("by_user_month", (q) =>
        q.eq("userId", clerkId).eq("month", month)
      )
      .collect();
  },
});

/** Presupuesto con nombre de categoría enriquecido para la UI. */
export const listByMonthWithCategory = query({
  args: { month: v.string() },
  handler: async (ctx, { month }) => {
    const clerkId = await getCurrentUserId(ctx);
    const budgets = await ctx.db
      .query("budgets")
      .withIndex("by_user_month", (q) =>
        q.eq("userId", clerkId).eq("month", month)
      )
      .collect();

    return await Promise.all(
      budgets.map(async (b) => {
        const category = await ctx.db.get(b.categoryId);
        return { ...b, categoryName: category?.name, categoryColor: category?.color };
      })
    );
  },
});

export const create = mutation({
  args: {
    categoryId: v.id("categories"),
    amount: v.number(),
    currency: v.string(),
    month: v.string(),
    alertThreshold: v.optional(v.number()),
    notes: v.optional(v.string()),
    recurring: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.amount <= 0 || !Number.isFinite(args.amount)) throw new Error("El monto del presupuesto debe ser mayor que cero");
    if (!/^[A-Za-z]{3}$/.test(args.currency)) throw new Error("Código de moneda inválido");
    if (args.alertThreshold !== undefined && (args.alertThreshold < 0 || args.alertThreshold > 100)) throw new Error("El umbral de alerta debe estar entre 0 y 100");
    if (args.notes !== undefined && args.notes.length > 500) throw new Error("Las notas no pueden superar 500 caracteres");

    const user = await getCurrentUser(ctx);
    const now = Date.now();
    return await ctx.db.insert("budgets", {
      userId: user.clerkId,
      categoryId: args.categoryId,
      amount: args.amount,
      spent: 0,
      currency: args.currency,
      month: args.month,
      alertThreshold: args.alertThreshold ?? 80,
      notes: args.notes,
      recurring: args.recurring ?? false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    budgetId: v.id("budgets"),
    amount: v.optional(v.number()),
    alertThreshold: v.optional(v.number()),
    notes: v.optional(v.string()),
    recurring: v.optional(v.boolean()),
  },
  handler: async (ctx, { budgetId, ...fields }) => {
    if (fields.amount !== undefined && (fields.amount <= 0 || !Number.isFinite(fields.amount))) throw new Error("El monto del presupuesto debe ser mayor que cero");
    if (fields.alertThreshold !== undefined && (fields.alertThreshold < 0 || fields.alertThreshold > 100)) throw new Error("El umbral de alerta debe estar entre 0 y 100");
    if (fields.notes !== undefined && fields.notes.length > 500) throw new Error("Las notas no pueden superar 500 caracteres");

    const user = await getCurrentUser(ctx);
    const budget = await ctx.db.get(budgetId);
    if (!budget || budget.userId !== user.clerkId) throw new Error("Presupuesto no encontrado");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) patch[k] = v;
    }
    await ctx.db.patch(budgetId, patch);
  },
});

export const remove = mutation({
  args: { budgetId: v.id("budgets") },
  handler: async (ctx, { budgetId }) => {
    const user = await getCurrentUser(ctx);
    const budget = await ctx.db.get(budgetId);
    if (!budget || budget.userId !== user.clerkId) throw new Error("Presupuesto no encontrado");
    await ctx.db.delete(budgetId);
  },
});

/** Interna: copia presupuestos recurrentes del mes anterior al mes actual. */
export const rolloverRecurring = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    const currentMonthStr = `${curYear}-${String(curMonth).padStart(2, "0")}`;

    const prevDate = new Date(curYear, curMonth - 2, 1);
    const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

    const recurringBudgets = await ctx.db
      .query("budgets")
      .filter((q) => q.eq(q.field("recurring"), true))
      .collect();

    const prevMonthBudgets = recurringBudgets.filter((b) => b.month === prevMonthStr);

    for (const budget of prevMonthBudgets) {
      const existing = await ctx.db
        .query("budgets")
        .withIndex("by_user_category_month", (q) =>
          q.eq("userId", budget.userId).eq("categoryId", budget.categoryId).eq("month", currentMonthStr)
        )
        .first();

      if (!existing) {
        const ts = Date.now();
        await ctx.db.insert("budgets", {
          userId: budget.userId,
          categoryId: budget.categoryId,
          amount: budget.amount,
          spent: 0,
          currency: budget.currency,
          month: currentMonthStr,
          alertThreshold: budget.alertThreshold,
          notes: budget.notes,
          recurring: true,
          createdAt: ts,
          updatedAt: ts,
        });
      }
    }
  },
});

/** Interna: presupuestos que superan su umbral y no han sido notificados hoy. */
export const listExceedingThreshold = internalQuery({
  args: {},
  handler: async (ctx) => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const all = await ctx.db.query("budgets").collect();
    return await Promise.all(
      all
        .filter((b) => {
          if (b.amount === 0) return false;
          const pct = b.spent / b.amount;
          const threshold = (b.alertThreshold ?? 80) / 100;
          if (pct < threshold) return false;
          if (b.notifiedAt && b.notifiedAt >= todayStart.getTime()) return false;
          return true;
        })
        .map(async (b) => {
          const cat = await ctx.db.get(b.categoryId);
          return { ...b, categoryName: cat?.name };
        })
    );
  },
});

/** Interna: actualiza notifiedAt tras enviar alerta. */
export const updateNotifiedAt = internalMutation({
  args: { budgetId: v.id("budgets"), notifiedAt: v.number() },
  handler: async (ctx, { budgetId, notifiedAt }) => {
    await ctx.db.patch(budgetId, { notifiedAt, updatedAt: Date.now() });
  },
});
