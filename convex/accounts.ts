import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser, getCurrentUserId } from "./lib/auth";
import { assertIsOwner } from "./lib/permissions";
import { toMonthString } from "./lib/utils";

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Balance consolidado en la moneda preferida del usuario.
 * Convierte cada cuenta usando currentExchangeRates.
 * Si no hay tasa para un par → suma el balance sin convertir y marca como "sin tasa".
 */
export const consolidatedBalance = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const clerkId = identity.subject;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (!user) return null;

    const preferredCurrency = user.currency ?? "COP";

    // Cuentas propias
    const ownAccounts = await ctx.db
      .query("accounts")
      .withIndex("by_owner_archived", (q) =>
        q.eq("ownerId", clerkId).eq("archived", false)
      )
      .collect();

    // Cuentas compartidas aceptadas
    const shares = await ctx.db
      .query("accountShares")
      .withIndex("by_shared_user_status", (q) =>
        q.eq("sharedWithUserId", clerkId).eq("status", "aceptada")
      )
      .collect();
    const sharedRaw = await Promise.all(shares.map((s) => ctx.db.get(s.accountId)));
    const sharedAccounts = sharedRaw.filter(
      (a): a is NonNullable<typeof a> => a !== null
    );

    // Tasas actuales
    const currentRates = await ctx.db.query("currentExchangeRates").collect();
    const rateMap = new Map(
      currentRates.map((r) => [`${r.fromCurrency}→${r.toCurrency}`, r.rate])
    );

    function convert(amount: number, fromCurrency: string): { converted: number; hasRate: boolean } {
      if (fromCurrency === preferredCurrency) return { converted: amount, hasRate: true };
      const rate = rateMap.get(`${fromCurrency}→${preferredCurrency}`);
      if (!rate) return { converted: amount, hasRate: false };
      return { converted: Math.round(amount * rate), hasRate: true };
    }

    let total = 0;
    const missingRates: string[] = [];

    const includedAccounts = [...ownAccounts, ...sharedAccounts].filter(
      (a) => a.includeInBalance !== false
    );

    for (const account of includedAccounts) {
      const { converted, hasRate } = convert(account.balance, account.currency);
      total += converted;
      if (!hasRate && account.currency !== preferredCurrency) {
        missingRates.push(account.currency);
      }
    }

    return {
      total,
      currency: preferredCurrency,
      missingRates: [...new Set(missingRates)],
      accountCount: includedAccounts.length,
    };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await getCurrentUserId(ctx);
    return await ctx.db
      .query("accounts")
      .withIndex("by_owner_archived", (q) =>
        q.eq("ownerId", clerkId).eq("archived", false)
      )
      .collect();
  },
});

export const getById = query({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    const clerkId = await getCurrentUserId(ctx);
    const account = await ctx.db.get(accountId);
    if (!account) return null;
    if (account.ownerId === clerkId) return account;

    const share = await ctx.db
      .query("accountShares")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .filter((q) =>
        q.and(
          q.eq(q.field("sharedWithUserId"), clerkId),
          q.eq(q.field("status"), "aceptada")
        )
      )
      .unique();
    return share ? account : null;
  },
});

export const listSharedWithMe = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await getCurrentUserId(ctx);
    const shares = await ctx.db
      .query("accountShares")
      .withIndex("by_shared_user_status", (q) =>
        q.eq("sharedWithUserId", clerkId).eq("status", "aceptada")
      )
      .collect();
    const accounts = await Promise.all(shares.map((s) => ctx.db.get(s.accountId)));
    return accounts.filter(Boolean);
  },
});

export const listPendingInvitations = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await getCurrentUserId(ctx);
    return await ctx.db
      .query("accountShares")
      .withIndex("by_shared_user_status", (q) =>
        q.eq("sharedWithUserId", clerkId).eq("status", "pendiente")
      )
      .collect();
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    name: v.string(),
    type: v.union(
      v.literal("billetera"),
      v.literal("bancaria"),
      v.literal("ahorros"),
      v.literal("inversion")
    ),
    bankName: v.optional(v.string()),
    accountNumber: v.optional(v.string()),
    initialBalance: v.number(), // en centavos
    currency: v.string(),
    color: v.string(),
    icon: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.name.length === 0 || args.name.length > 100) throw new Error("El nombre debe tener entre 1 y 100 caracteres");
    if (!Number.isFinite(args.initialBalance) || args.initialBalance < 0) throw new Error("El saldo inicial debe ser mayor o igual a cero");
    if (!/^[A-Za-z]{3}$/.test(args.currency)) throw new Error("Código de moneda inválido");
    if (args.accountNumber !== undefined && args.accountNumber.length > 50) throw new Error("El número de cuenta no puede superar 50 caracteres");
    if (args.notes !== undefined && args.notes.length > 500) throw new Error("Las notas no pueden superar 500 caracteres");

    const user = await getCurrentUser(ctx);
    const now = Date.now();
    return await ctx.db.insert("accounts", {
      ownerId: user.clerkId,
      name: args.name,
      type: args.type,
      bankName: args.bankName,
      accountNumber: args.accountNumber,
      balance: args.initialBalance,
      initialBalance: args.initialBalance,
      currency: args.currency,
      color: args.color,
      icon: args.icon,
      isDefault: false,
      isShared: false,
      archived: false,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    accountId: v.id("accounts"),
    name: v.optional(v.string()),
    type: v.optional(v.union(
      v.literal("billetera"),
      v.literal("bancaria"),
      v.literal("ahorros"),
      v.literal("inversion")
    )),
    bankName: v.optional(v.string()),
    accountNumber: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { accountId, ...fields }) => {
    if (fields.name !== undefined && (fields.name.length === 0 || fields.name.length > 100)) throw new Error("El nombre debe tener entre 1 y 100 caracteres");
    if (fields.accountNumber !== undefined && fields.accountNumber.length > 50) throw new Error("El número de cuenta no puede superar 50 caracteres");
    if (fields.notes !== undefined && fields.notes.length > 500) throw new Error("Las notas no pueden superar 500 caracteres");

    const user = await getCurrentUser(ctx);
    const account = await ctx.db.get(accountId);
    if (!account || account.ownerId !== user.clerkId) {
      throw new Error("Cuenta no encontrada o sin permisos");
    }
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) patch[k] = v;
    }
    await ctx.db.patch(accountId, patch);
  },
});

/** Elimina la cuenta y todos sus registros asociados (cascade). */
export const remove = mutation({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    const user = await getCurrentUser(ctx);
    const account = await ctx.db.get(accountId);
    if (!account || account.ownerId !== user.clerkId) {
      throw new Error("Cuenta no encontrada o sin permisos");
    }

    // 1. Compartidos
    const shares = await ctx.db
      .query("accountShares")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .collect();
    for (const share of shares) {
      await ctx.db.delete(share._id);
    }

    // 2. Transacciones donde la cuenta es origen O destino de transferencia
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_user", (q) => q.eq("userId", user.clerkId))
      .collect();
    for (const tx of transactions) {
      if (tx.accountId === accountId || tx.toAccountId === accountId) {
        await ctx.db.delete(tx._id);
      }
    }

    // 3. Transacciones recurrentes que referencien esta cuenta
    const recurring = await ctx.db
      .query("recurringTransactions")
      .withIndex("by_user", (q) => q.eq("userId", user.clerkId))
      .collect();
    for (const rt of recurring) {
      if (rt.accountId === accountId) {
        await ctx.db.delete(rt._id);
      }
    }

    // 4. La cuenta
    await ctx.db.delete(accountId);
  },
});

export const archive = mutation({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    const user = await getCurrentUser(ctx);
    const account = await ctx.db.get(accountId);
    if (!account || account.ownerId !== user.clerkId) {
      throw new Error("Cuenta no encontrada o sin permisos");
    }
    if (account.isDefault) {
      throw new Error("No se puede archivar la cuenta por defecto");
    }
    await ctx.db.patch(accountId, { archived: true, updatedAt: Date.now() });
  },
});

/**
 * Reasigna el saldo actual de una cuenta. La diferencia entre el saldo nuevo y
 * el actual se registra como una transacción de tipo "ajuste" con descripción
 * "Reasignación bancaria" — visible en el historial pero excluida de los
 * resúmenes de ingresos/gastos.
 *
 * Solo el propietario puede ajustar el saldo (no editores ni admins de cuentas
 * compartidas). Convex serializa la mutación → no hay race entre lectura y
 * escritura del balance.
 */
export const reassignBalance = mutation({
  args: {
    accountId: v.id("accounts"),
    newBalance: v.number(), // en centavos, entero ≥ 0
  },
  handler: async (ctx, { accountId, newBalance }) => {
    if (!Number.isInteger(newBalance) || newBalance < 0) {
      throw new Error("El saldo debe ser un entero mayor o igual a cero");
    }
    if (newBalance > 9_999_999_999) {
      throw new Error("Saldo fuera de rango permitido");
    }

    await assertIsOwner(ctx, accountId);

    const user = await getCurrentUser(ctx);
    const account = await ctx.db.get(accountId);
    if (!account) throw new Error("Cuenta no encontrada");
    if (account.archived) throw new Error("No se puede ajustar una cuenta archivada");

    const previousBalance = account.balance;
    const delta = newBalance - previousBalance;

    if (delta === 0) {
      return { adjusted: false as const };
    }

    const now = Date.now();

    const txId = await ctx.db.insert("transactions", {
      userId: user.clerkId,
      type: "ajuste",
      amount: Math.abs(delta),
      description: "Reasignación bancaria",
      date: now,
      month: toMonthString(now),
      currency: account.currency,
      accountId,
      status: "completada",
      isRecurring: false,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(accountId, { balance: newBalance, updatedAt: now });

    await ctx.db.insert("auditLogs", {
      userId: user.clerkId,
      action: "account.balance.reassigned",
      entity: "account",
      entityId: accountId,
      metadata: { previousBalance, newBalance, delta, txId },
      createdAt: now,
    });

    return { adjusted: true as const, delta, txId };
  },
});

/** Retorna true si la cuenta tiene al menos una transacción registrada. */
export const hasTransactions = query({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    await assertIsOwner(ctx, accountId);
    const tx = await ctx.db
      .query("transactions")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .take(1);
    return tx.length > 0;
  },
});

/**
 * Corrige directamente el saldo de una cuenta sin transacciones.
 * Actualiza `balance` e `initialBalance` sin generar ningún registro.
 * Falla si la cuenta ya tiene transacciones — usar `reassignBalance` en ese caso.
 */
export const correctBalance = mutation({
  args: {
    accountId: v.id("accounts"),
    newBalance: v.number(),
  },
  handler: async (ctx, { accountId, newBalance }) => {
    if (!Number.isInteger(newBalance) || newBalance < 0) {
      throw new Error("El saldo debe ser un entero mayor o igual a cero");
    }
    if (newBalance > 9_999_999_999) {
      throw new Error("Saldo fuera de rango permitido");
    }

    await assertIsOwner(ctx, accountId);

    const user = await getCurrentUser(ctx);
    const account = await ctx.db.get(accountId);
    if (!account) throw new Error("Cuenta no encontrada");
    if (account.archived) throw new Error("No se puede corregir una cuenta archivada");

    const existingTx = await ctx.db
      .query("transactions")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .take(1);
    if (existingTx.length > 0) {
      throw new Error("La cuenta ya tiene transacciones — usá Ajustar saldo en su lugar");
    }

    const previousBalance = account.balance;
    if (newBalance === previousBalance) {
      return { corrected: false as const };
    }

    const now = Date.now();
    await ctx.db.patch(accountId, { balance: newBalance, initialBalance: newBalance, updatedAt: now });

    await ctx.db.insert("auditLogs", {
      userId: user.clerkId,
      action: "account.balance.corrected",
      entity: "account",
      entityId: accountId,
      metadata: { previousBalance, newBalance },
      createdAt: now,
    });

    return { corrected: true as const };
  },
});

// Incluye o excluye una cuenta propia del cálculo de patrimonio total.
// Las cuentas compartidas no son modificables por el que las recibe.
export const toggleBalanceInclusion = mutation({
  args: {
    accountId: v.id("accounts"),
    include: v.boolean(),
  },
  handler: async (ctx, { accountId, include }) => {
    const user = await getCurrentUser(ctx);
    const account = await ctx.db.get(accountId);
    if (!account || account.ownerId !== user.clerkId) {
      throw new Error("Cuenta no encontrada o sin permisos");
    }
    await ctx.db.patch(accountId, {
      includeInBalance: include,
      updatedAt: Date.now(),
    });
  },
});
