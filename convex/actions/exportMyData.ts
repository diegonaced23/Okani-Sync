"use node";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { getCurrentUserFromAction } from "../lib/auth";
import { buildTableExport } from "../../src/lib/exportPayload";
import {
  EXPORT_MAX_ROWS_PER_TABLE,
  EXPORT_FILE_TTL_MS,
  AUDIT_ACTIONS,
} from "../../src/lib/constants";

/**
 * Campos monetarios por tabla. El export emite cada uno dos veces: el entero
 * en centavos y su valor humano en `<campo>Value` (ver src/lib/exportPayload.ts).
 */
// Nombres verificados uno a uno contra convex/schema.ts. Se excluyen a
// propósito los numéricos que NO son dinero: interestRate, cutoffDay,
// paymentDay, dayOfMonth, displayOrder, contadores de cuotas y timestamps.
const MONEY_FIELDS: Record<string, readonly string[]> = {
  accounts: ["balance", "initialBalance"],
  accountShares: [],
  categories: [],
  cards: ["creditLimit", "currentBalance", "availableCredit", "minimumPayment"],
  cardPurchases: ["totalAmount", "totalWithInterest", "amountPerInstallment", "totalInterest"],
  cardInstallments: ["amount", "principalAmount", "interestAmount", "remainingPrincipal"],
  transactions: ["amount", "toAmount"],
  recurringTransactions: ["amount"],
  budgets: ["amount", "spent"],
  debts: ["originalAmount", "currentBalance", "monthlyPayment"],
  debtPayments: ["amount"],
  loans: ["originalAmount", "currentBalance"],
  loanRepayments: ["amount"],
  goals: ["targetAmount", "currentAmount"],
  netWorthSnapshots: [
    "totalAssets",
    "totalCardDebt",
    "totalDebt",
    "totalLoansReceivable",
    "netWorth",
  ],
};

/**
 * Respaldo completo de la cuenta.
 *
 * El JSON NO se devuelve en el valor de retorno: se guarda en `_storage` y se
 * entrega por URL. Un retorno directo de quince tablas quedaría expuesto al
 * límite de tamaño del valor de retorno de una función de Convex; pasar por
 * storage elimina esa clase de riesgo y además da una URL real de descarga.
 *
 * `"use node"` arriba es obligatorio: este archivo vive en `convex/actions/`,
 * carpeta legacy de Convex donde el CLI exige el directive en todos los
 * archivos aunque no usen ningún builtin de Node (Blob y ctx.storage
 * funcionan igual bajo Node). La limpieza (`cleanup`) por eso se definió en
 * `convex/exportData.ts` y no aquí: una mutation no puede convivir con
 * `"use node"` en el mismo archivo.
 */
export const run = action({
  args: {},
  handler: async (
    ctx
  ): Promise<{ url: string; sizeBytes: number; truncatedTables: string[] }> => {
    const user = await getCurrentUserFromAction(ctx);
    const userId = user.clerkId;

    const grupos = await Promise.all([
      ctx.runQuery(internal.exportData.readAccountTables, { userId }),
      ctx.runQuery(internal.exportData.readCardTables, { userId }),
      ctx.runQuery(internal.exportData.readTransactionTables, { userId }),
      ctx.runQuery(internal.exportData.readDebtTables, { userId }),
      ctx.runQuery(internal.exportData.readGoalTables, { userId }),
    ]);

    const tablasCrudas = Object.assign({}, ...grupos) as Record<
      string,
      Record<string, unknown>[]
    >;

    const tablas: Record<string, ReturnType<typeof buildTableExport>> = {};
    const truncatedTables: string[] = [];
    for (const [nombre, filas] of Object.entries(tablasCrudas)) {
      const exportada = buildTableExport(
        filas,
        EXPORT_MAX_ROWS_PER_TABLE,
        MONEY_FIELDS[nombre] ?? []
      );
      tablas[nombre] = exportada;
      if (exportada.truncated) truncatedTables.push(nombre);
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      app: "Okany Sync",
      usuario: { email: user.email, name: user.name, currency: user.currency },
      nota:
        "Los montos vienen en dos formas: el campo original es el entero en " +
        "centavos tal cual está almacenado, y el campo '<nombre>Value' es su " +
        "valor decimal equivalente.",
      maxFilasPorTabla: EXPORT_MAX_ROWS_PER_TABLE,
      tablas,
    };

    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const storageId = await ctx.storage.store(blob);

    // El archivo es temporal: sin este borrado programado, cada exportación
    // dejaría un archivo permanente por usuario. Se agenda inmediatamente
    // después de `storage.store`, antes de cualquier código que pueda lanzar
    // (como la verificación de `url` de abajo): si el `throw` ocurriera antes
    // de agendar la limpieza, el archivo quedaría huérfano para siempre.
    await ctx.scheduler.runAfter(EXPORT_FILE_TTL_MS, internal.exportData.cleanup, {
      storageId,
    });

    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("No se pudo generar el archivo de exportación");

    await ctx.runMutation(internal.users.logAuditAction, {
      userId,
      action: AUDIT_ACTIONS.USER_DATA_EXPORTED,
      metadata: { truncatedTables },
    });

    // `json.length` cuenta unidades UTF-16, no bytes: subestima el tamaño con
    // texto acentuado. `blob.size` es el tamaño real en bytes.
    return { url, sizeBytes: blob.size, truncatedTables };
  },
});
