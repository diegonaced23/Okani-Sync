import { query, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { getCurrentUser, getCurrentUserId } from "./lib/auth";
import { getUserRateMap, convertAmount } from "./lib/money";
import {
  ENDED_OCCURRENCE,
  dateKeyToTs,
  daysInMonthUTC,
  monthlyFactor,
  nextOccurrenceAfter,
  type Frequency,
} from "../src/lib/recurrence";

const DAY_MS = 86_400_000;

const frequencyValidator = v.union(
  v.literal("semanal"),
  v.literal("quincenal"),
  v.literal("mensual"),
  v.literal("anual")
);

/**
 * Convierte la fecha del primer cobro ("YYYY-MM-DD") en `nextOccurrence` y el día
 * ancla. Mensual usa el día elegido (puede ser 31 aunque este mes tenga 30); anual,
 * el día de la fecha.
 */
function resolveSchedule(
  frequency: Frequency,
  firstDate: string,
  dayOfMonth: number | undefined,
  now: number
): { nextOccurrence: number; dayOfMonth: number | undefined } {
  const ts = dateKeyToTs(firstDate);
  // Tolerancia de un día hacia atrás: el cliente calcula "hoy" en su zona horaria
  if (ts < now - 2 * DAY_MS) throw new Error("La fecha del primer cobro ya pasó");
  if (ts > now + 400 * DAY_MS) throw new Error("La fecha del primer cobro es demasiado lejana");

  const d = new Date(ts);
  if (frequency === "mensual") {
    if (dayOfMonth === undefined || !Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31)
      throw new Error("El día del mes debe estar entre 1 y 31");
    const expected = Math.min(dayOfMonth, daysInMonthUTC(d.getUTCFullYear(), d.getUTCMonth()));
    if (d.getUTCDate() !== expected) throw new Error("La fecha no coincide con el día del mes");
    return { nextOccurrence: ts, dayOfMonth };
  }
  if (frequency === "anual") return { nextOccurrence: ts, dayOfMonth: d.getUTCDate() };
  return { nextOccurrence: ts, dayOfMonth: undefined };
}

/** Valida la fuente y devuelve su moneda: el recurrente siempre usa la de su cuenta o tarjeta. */
async function resolveSource(
  ctx: MutationCtx,
  userId: string,
  type: Doc<"recurringTransactions">["type"],
  accountId: Id<"accounts"> | undefined,
  cardId: Id<"cards"> | undefined
): Promise<string> {
  if (accountId !== undefined && cardId !== undefined)
    throw new Error("Selecciona solo una cuenta o tarjeta, no ambas");
  if (accountId === undefined && cardId === undefined)
    throw new Error("Debes seleccionar una cuenta o tarjeta");
  if (accountId !== undefined) {
    const account = await ctx.db.get(accountId);
    if (!account || account.ownerId !== userId || account.archived)
      throw new Error("Cuenta no encontrada");
    return account.currency;
  }
  if (type === "ingreso") throw new Error("Un ingreso solo puede llegar a una cuenta");
  const card = await ctx.db.get(cardId!);
  if (!card || card.userId !== userId || card.archived) throw new Error("Tarjeta no encontrada");
  return card.currency;
}

async function assertCategory(
  ctx: MutationCtx,
  userId: string,
  type: Doc<"recurringTransactions">["type"],
  categoryId: Id<"categories">
) {
  const cat = await ctx.db.get(categoryId);
  if (!cat || cat.userId !== userId || cat.archived) throw new Error("Categoría no encontrada");
  const wanted = type === "ingreso" ? "ingreso" : "gasto";
  if (cat.type !== wanted && cat.type !== "ambos")
    throw new Error(`La categoría debe ser de tipo ${wanted}`);
}

function assertBasics(description: string | undefined, amount: number | undefined) {
  if (description !== undefined && (description.trim().length === 0 || description.length > 100))
    throw new Error("La descripción debe tener entre 1 y 100 caracteres");
  if (amount !== undefined && (!Number.isInteger(amount) || amount <= 0))
    throw new Error("El monto debe ser mayor que cero");
}

async function getOwned(ctx: MutationCtx, userId: string, recurringId: Id<"recurringTransactions">) {
  const rec = await ctx.db.get(recurringId);
  if (!rec || rec.userId !== userId || !rec.active) throw new Error("Recurrente no encontrado");
  return rec;
}

/** Si la próxima fecha quedó en el pasado (pausado o eliminado un tiempo), la lleva a la siguiente futura. */
function catchUp(rec: Doc<"recurringTransactions">, now: number): number {
  if (rec.nextOccurrence > now || rec.nextOccurrence >= ENDED_OCCURRENCE) return rec.nextOccurrence;
  return nextOccurrenceAfter(rec.frequency, rec.nextOccurrence, now, rec.dayOfMonth);
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await getCurrentUserId(ctx);
    return await ctx.db
      .query("recurringTransactions")
      .withIndex("by_user_active", (q) => q.eq("userId", clerkId).eq("active", true))
      .take(500);
  },
});

/**
 * Compromiso mensual estimado en la moneda preferida: cada recurrente activo y no
 * pausado, llevado a su equivalente mensual (semanal ×52/12, anual ÷12, …).
 */
export const summary = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    const { rateMap, preferredCurrency } = await getUserRateMap(ctx, user);
    const recs = await ctx.db
      .query("recurringTransactions")
      .withIndex("by_user_active", (q) => q.eq("userId", user.clerkId).eq("active", true))
      .take(500);

    let monthlyExpense = 0;
    let monthlyIncome = 0;
    let missingRate = false;
    for (const r of recs) {
      if (r.paused || r.nextOccurrence >= ENDED_OCCURRENCE) continue;
      const { converted, hasRate } = convertAmount(r.amount, r.currency, preferredCurrency, rateMap);
      if (!hasRate) { missingRate = true; continue; }
      const monthly = Math.round(converted * monthlyFactor(r.frequency));
      if (r.type === "ingreso") monthlyIncome += monthly;
      else monthlyExpense += monthly;
    }
    return { currency: preferredCurrency, monthlyExpense, monthlyIncome, missingRate };
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    type: v.union(v.literal("gasto"), v.literal("ingreso")),
    description: v.string(),
    amount: v.number(),
    accountId: v.optional(v.id("accounts")),
    cardId: v.optional(v.id("cards")),
    categoryId: v.optional(v.id("categories")),
    frequency: frequencyValidator,
    /** Fecha del primer cobro, "YYYY-MM-DD" */
    firstDate: v.string(),
    /** Solo mensual: el día elegido (1–31) */
    dayOfMonth: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertBasics(args.description, args.amount);
    const user = await getCurrentUser(ctx);
    const now = Date.now();

    const currency = await resolveSource(ctx, user.clerkId, args.type, args.accountId, args.cardId);
    if (args.categoryId !== undefined) await assertCategory(ctx, user.clerkId, args.type, args.categoryId);
    const schedule = resolveSchedule(args.frequency, args.firstDate, args.dayOfMonth, now);

    return await ctx.db.insert("recurringTransactions", {
      userId: user.clerkId,
      type: args.type,
      frequency: args.frequency,
      description: args.description.trim(),
      amount: args.amount,
      accountId: args.accountId,
      cardId: args.cardId,
      categoryId: args.categoryId,
      dayOfMonth: schedule.dayOfMonth,
      currency,
      startDate: schedule.nextOccurrence,
      nextOccurrence: schedule.nextOccurrence,
      active: true,
      paused: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    recurringId: v.id("recurringTransactions"),
    description: v.optional(v.string()),
    amount: v.optional(v.number()),
    accountId: v.optional(v.id("accounts")),
    cardId: v.optional(v.id("cards")),
    categoryId: v.optional(v.id("categories")),
    clearCategory: v.optional(v.boolean()),
    /** Cambiar la programación: se mandan los tres juntos */
    frequency: v.optional(frequencyValidator),
    firstDate: v.optional(v.string()),
    dayOfMonth: v.optional(v.number()),
  },
  handler: async (ctx, { recurringId, ...fields }) => {
    assertBasics(fields.description, fields.amount);
    const user = await getCurrentUser(ctx);
    const rec = await getOwned(ctx, user.clerkId, recurringId);
    const now = Date.now();
    const patch: Partial<Doc<"recurringTransactions">> = { updatedAt: now };

    if (fields.description !== undefined) patch.description = fields.description.trim();
    if (fields.amount !== undefined) patch.amount = fields.amount;

    // Cambio de fuente: llega una de las dos y la otra se limpia
    if (fields.accountId !== undefined || fields.cardId !== undefined) {
      patch.currency = await resolveSource(ctx, user.clerkId, rec.type, fields.accountId, fields.cardId);
      patch.accountId = fields.accountId;
      patch.cardId = fields.cardId;
    }

    if (fields.categoryId !== undefined) {
      await assertCategory(ctx, user.clerkId, rec.type, fields.categoryId);
      patch.categoryId = fields.categoryId;
    } else if (fields.clearCategory === true) {
      patch.categoryId = undefined;
    }

    if (fields.frequency !== undefined || fields.firstDate !== undefined) {
      if (fields.frequency === undefined || fields.firstDate === undefined)
        throw new Error("Para cambiar la programación se necesitan frecuencia y fecha");
      const schedule = resolveSchedule(fields.frequency, fields.firstDate, fields.dayOfMonth, now);
      patch.frequency = fields.frequency;
      patch.dayOfMonth = schedule.dayOfMonth;
      patch.nextOccurrence = schedule.nextOccurrence;
    }

    await ctx.db.patch(recurringId, patch);
  },
});

/**
 * Pausa o reanuda. Al reanudar, si la próxima fecha quedó atrás se lleva a la
 * siguiente futura: sin esto el cron generaría de inmediato un movimiento atrasado.
 */
export const setPaused = mutation({
  args: { recurringId: v.id("recurringTransactions"), paused: v.boolean() },
  handler: async (ctx, { recurringId, paused }) => {
    const user = await getCurrentUser(ctx);
    const rec = await getOwned(ctx, user.clerkId, recurringId);
    const now = Date.now();
    await ctx.db.patch(recurringId, {
      paused,
      ...(paused ? {} : { nextOccurrence: catchUp(rec, now) }),
      updatedAt: now,
    });
  },
});

// Soft delete: desactiva el recurrente para que el cron no lo procese.
// Las transacciones pasadas con recurringId apuntando aquí se mantienen intactas.
export const remove = mutation({
  args: { recurringId: v.id("recurringTransactions") },
  handler: async (ctx, { recurringId }) => {
    const user = await getCurrentUser(ctx);
    const rec = await getOwned(ctx, user.clerkId, recurringId);
    await ctx.db.patch(rec._id, { active: false, updatedAt: Date.now() });
  },
});

/** Deshace un `remove` reciente (el "Deshacer" del aviso). */
export const restore = mutation({
  args: { recurringId: v.id("recurringTransactions") },
  handler: async (ctx, { recurringId }) => {
    const user = await getCurrentUser(ctx);
    const rec = await ctx.db.get(recurringId);
    if (!rec || rec.userId !== user.clerkId) throw new Error("Recurrente no encontrado");
    if (rec.active) return;
    const now = Date.now();
    await ctx.db.patch(recurringId, {
      active: true,
      nextOccurrence: catchUp(rec, now),
      updatedAt: now,
    });
  },
});
