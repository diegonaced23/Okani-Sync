import { query, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { getCurrentUserId } from "./lib/auth";
import { buildRateMap, convertAmount, type RateMap } from "./lib/money";

// ─── Queries ──────────────────────────────────────────────────────────────────

/** Retorna todos los snapshots del usuario ordenados por mes ascendente (para el gráfico). */
export const listByUser = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await getCurrentUserId(ctx);
    return await ctx.db
      .query("netWorthSnapshots")
      .withIndex("by_user_month", (q) => q.eq("userId", clerkId))
      .order("asc")
      .collect();
  },
});

// ─── Helper interno ───────────────────────────────────────────────────────────

/**
 * Calcula el patrimonio neto de un usuario y lo almacena como snapshot del mes.
 * Usa exactamente el mismo scope y conversión que `accounts.netWorth` (2.1) para
 * que los valores históricos sean coherentes con la cifra en tiempo real del dashboard.
 *
 * Si ya existe un snapshot para ese userId + month, lo reemplaza (idempotente).
 */
async function captureForUser(
  ctx: MutationCtx,
  userId: string,
  preferredCurrency: string,
  month: string,
  rateMap: RateMap
) {
  function conv(amountCents: number, fromCurrency: string): number {
    const { converted } = convertAmount(amountCents, fromCurrency, preferredCurrency, rateMap);
    return converted;
  }

  // Cuentas propias + compartidas aceptadas
  const ownAccounts = await ctx.db
    .query("accounts")
    .withIndex("by_owner_archived", (q) => q.eq("ownerId", userId).eq("archived", false))
    .collect();

  const shares = await ctx.db
    .query("accountShares")
    .withIndex("by_shared_user_status", (q) =>
      q.eq("sharedWithUserId", userId).eq("status", "aceptada")
    )
    .collect();
  const sharedRaw = await Promise.all(shares.map((s) => ctx.db.get(s.accountId)));
  const allAccounts = [
    ...ownAccounts,
    ...sharedRaw.filter((a): a is NonNullable<typeof a> => a !== null),
  ].filter((a) => a.includeInBalance !== false);

  const totalAssets = allAccounts.reduce((s, a) => s + conv(a.balance, a.currency), 0);

  // Tarjetas no archivadas
  const cards = await ctx.db
    .query("cards")
    .withIndex("by_user_archived", (q) => q.eq("userId", userId).eq("archived", false))
    .collect();
  const totalCardDebt = cards.reduce((s, c) => s + conv(c.currentBalance, c.currency), 0);

  // Deudas activas + vencidas
  const [activeDebts, overdueDebts] = await Promise.all([
    ctx.db.query("debts").withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "activa")).collect(),
    ctx.db.query("debts").withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "vencida")).collect(),
  ]);
  const totalDebt = [...activeDebts, ...overdueDebts].reduce(
    (s, d) => s + conv(d.currentBalance, d.currency), 0
  );

  // Préstamos activos + vencidos (activo: dinero que nos deben)
  const [activeLoans, overdueLoans] = await Promise.all([
    ctx.db.query("loans").withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "activa")).collect(),
    ctx.db.query("loans").withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "vencida")).collect(),
  ]);
  const totalLoansReceivable = [...activeLoans, ...overdueLoans].reduce(
    (s, l) => s + conv(l.currentBalance, l.currency), 0
  );

  const netWorth = totalAssets + totalLoansReceivable - totalCardDebt - totalDebt;

  // Upsert — idempotente: re-ejecutar el cron no duplica datos
  const existing = await ctx.db
    .query("netWorthSnapshots")
    .withIndex("by_user_month", (q) => q.eq("userId", userId).eq("month", month))
    .unique();

  const payload = {
    userId, month, totalAssets, totalCardDebt, totalDebt,
    totalLoansReceivable, netWorth,
    currency: preferredCurrency,
    createdAt: Date.now(),
  };

  if (existing) {
    await ctx.db.patch(existing._id, payload);
  } else {
    await ctx.db.insert("netWorthSnapshots", payload);
  }
}

// ─── Mutations internas (llamadas por cron) ───────────────────────────────────

/**
 * Captura el snapshot del mes anterior para todos los usuarios activos.
 * Ejecutar el día 1 de cada mes ANTES del rollover de presupuestos.
 *
 * El mes capturado es el mes anterior al de ejecución:
 * si se ejecuta el 2026-07-01 → snapshot para "2026-06".
 */
export const captureForAllUsers = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const d = new Date(now);
    const prevMonthDate = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const month = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}`;

    const currentRates = await ctx.db.query("currentExchangeRates").collect();

    const users = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("active"), true))
      .collect();

    for (const user of users) {
      const preferredCurrency = user.currency ?? "COP";
      const rateMap = buildRateMap(currentRates, preferredCurrency);
      await captureForUser(ctx, user.clerkId, preferredCurrency, month, rateMap);
    }

    console.log(`netWorthSnapshots: capturados ${users.length} snapshots para ${month}`);
    return { month, usersProcessed: users.length };
  },
});
