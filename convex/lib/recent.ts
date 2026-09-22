/**
 * Últimos movimientos del dashboard: movimientos y compras a cuotas en una sola
 * lista por fecha.
 *
 * Una compra a varias cuotas no tiene movimiento hasta que su primera cuota se
 * factura en el corte (ver `lib/cardBilling.ts`), así que sin esto una compra de
 * hoy no aparecería hasta el día 25. Se muestra la compra en su fecha, como hace
 * la lista de Movimientos con el registro «padre». Se excluyen:
 * - las de contado: su movimiento se crea el mismo día de la compra;
 * - las del modelo anterior (`billsAtCutoff: false`): su cuota 1 ya las representa.
 */
export function mergeRecent<
  T extends { date: number },
  P extends {
    purchaseDate: number;
    totalInstallments: number;
    billsAtCutoff: boolean;
    totalAmount: number;
  },
>(transactions: readonly T[], purchases: readonly P[], limit: number) {
  const rows = [
    ...transactions.map((tx) => ({ ...tx, kind: "tx" as const })),
    ...purchases
      .filter((p) => p.totalInstallments > 1 && p.billsAtCutoff)
      .map((p) => ({ ...p, kind: "purchase" as const, date: p.purchaseDate, amount: p.totalAmount })),
  ];
  rows.sort((a, b) => b.date - a.date);
  return rows.slice(0, limit);
}
