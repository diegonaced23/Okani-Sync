import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { getCurrentUser, getCurrentUserId } from "./lib/auth";

// ─── Helper interno ───────────────────────────────────────────────────────────

async function upsertCurrentRate(
  ctx: MutationCtx,
  fromCurrency: string,
  toCurrency: string,
  rate: number
) {
  const existing = await ctx.db
    .query("currentExchangeRates")
    .withIndex("by_pair", (q) =>
      q.eq("fromCurrency", fromCurrency).eq("toCurrency", toCurrency)
    )
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, { rate, updatedAt: Date.now() });
  } else {
    await ctx.db.insert("currentExchangeRates", {
      fromCurrency,
      toCurrency,
      rate,
      updatedAt: Date.now(),
    });
  }
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export const listCurrent = query({
  args: {},
  handler: async (ctx) => {
    await getCurrentUserId(ctx);
    return await ctx.db.query("currentExchangeRates").collect();
  },
});

export const getCurrent = query({
  args: { fromCurrency: v.string(), toCurrency: v.string() },
  handler: async (ctx, { fromCurrency, toCurrency }) => {
    await getCurrentUserId(ctx);
    return await ctx.db
      .query("currentExchangeRates")
      .withIndex("by_pair", (q) =>
        q.eq("fromCurrency", fromCurrency).eq("toCurrency", toCurrency)
      )
      .unique();
  },
});

export const getHistory = query({
  args: {
    fromCurrency: v.string(),
    toCurrency: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { fromCurrency, toCurrency, limit = 30 }) => {
    await getCurrentUserId(ctx);
    return await ctx.db
      .query("exchangeRates")
      .withIndex("by_pair_date", (q) =>
        q.eq("fromCurrency", fromCurrency).eq("toCurrency", toCurrency)
      )
      .order("desc")
      .take(limit);
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

export const setManualRate = mutation({
  args: {
    fromCurrency: v.string(),
    toCurrency: v.string(),
    rate: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const now = Date.now();
    await ctx.db.insert("exchangeRates", {
      fromCurrency: args.fromCurrency,
      toCurrency: args.toCurrency,
      rate: args.rate,
      source: "manual",
      effectiveDate: now,
      createdAt: now,
      createdBy: user.clerkId,
    });
    await upsertCurrentRate(ctx, args.fromCurrency, args.toCurrency, args.rate);
  },
});

/** Query interna para que la action valide el delta antes de insertar. */
export const getCurrentInternal = internalQuery({
  args: { fromCurrency: v.string(), toCurrency: v.string() },
  handler: async (ctx, { fromCurrency, toCurrency }) => {
    return await ctx.db
      .query("currentExchangeRates")
      .withIndex("by_pair", (q) =>
        q.eq("fromCurrency", fromCurrency).eq("toCurrency", toCurrency)
      )
      .unique();
  },
});

/** Llamado por el cron de tasas y por fetchExchangeRates action. */
export const upsertCurrent = internalMutation({
  args: {
    fromCurrency: v.string(),
    toCurrency: v.string(),
    rate: v.number(),
    effectiveDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.insert("exchangeRates", {
      fromCurrency: args.fromCurrency,
      toCurrency: args.toCurrency,
      rate: args.rate,
      source: "api",
      effectiveDate: args.effectiveDate ?? now,
      createdAt: now,
    });
    await upsertCurrentRate(ctx, args.fromCurrency, args.toCurrency, args.rate);
  },
});
