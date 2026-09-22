/**
 * Últimos movimientos del dashboard: movimientos y compras a cuotas en una sola
 * lista por fecha.
 *
 * Una compra a varias cuotas aparece UNA vez, como compra, con su monto total y
 * cuántas cuotas son. Su cuota de ese mes no se repite debajo: sería la misma
 * compra dos veces con montos distintos. A partir del mes siguiente ya no hay
 * registro de compra y se ven las cuotas («Cuota 2/3»), que es lo que se gasta
 * ese mes. El interés sí se muestra: es plata aparte, no parte del precio.
 *
 * Se excluyen de las compras:
 * - las de contado: su movimiento ya cuenta la historia completa;
 * - las del modelo anterior (`billsAtCutoff: false`): su cuota 1 ya las representa.
 */
export function mergeRecent<
  T extends { date: number; cardPurchaseId?: string; cardChargeKind?: "cuota" | "interes" },
  P extends {
    _id: string;
    purchaseDate: number;
    totalInstallments: number;
    billsAtCutoff: boolean;
    totalAmount: number;
  },
>(transactions: readonly T[], purchases: readonly P[], limit: number) {
  const shown = purchases.filter((p) => p.totalInstallments > 1 && p.billsAtCutoff);
  const shownIds = new Set(shown.map((p) => p._id));

  const rows = [
    ...transactions
      .filter((tx) => !(tx.cardChargeKind === "cuota" && tx.cardPurchaseId && shownIds.has(tx.cardPurchaseId)))
      .map((tx) => ({ ...tx, kind: "tx" as const })),
    ...shown.map((p) => ({ ...p, kind: "purchase" as const, date: p.purchaseDate, amount: p.totalAmount })),
  ];
  rows.sort((a, b) => b.date - a.date);
  return rows.slice(0, limit);
}
