import type { Doc } from "../../../convex/_generated/dataModel";
import { TX_TYPE_CONFIG } from "./tx-type-config";

// Utilidades de estilo iOS compartidas con los demás módulos (viven en src/lib/ios.ts)
export { EASE_OUT_EXPO, GLASS_SURFACE, OVERFLOW_ROW, SPRING, haptic, tint } from "@/lib/ios";

export type Transaction = Doc<"transactions">;
export type CardPurchase = Doc<"cardPurchases">;

/** Tipos cuya edición tiene sentido; el resto son asientos derivados de otra cosa. */
const EDITABLE_TYPES = new Set(["ingreso", "gasto", "transferencia", "gasto_tarjeta"]);

export function canEditTx(tx: Pick<Transaction, "type">): boolean {
  return EDITABLE_TYPES.has(tx.type);
}

/**
 * Lo que el backend no deja borrar:
 * - Una reasignación de saldo: deshacerla dejaría el saldo sin explicación. Se
 *   corrige creando otra.
 * - Una cuota de una compra con tarjeta, o su interés: son parte del cronograma
 *   de la compra. Se quitan editando o eliminando la compra.
 */
export function canDeleteTx(tx: Pick<Transaction, "type"> & { cardInstallmentId?: unknown }): boolean {
  if (tx.type === "ajuste") return false;
  return !(tx.type === "gasto_tarjeta" && tx.cardInstallmentId);
}

/**
 * Las filas que nacen de una compra a cuotas no se tocan desde la lista: al abrirlas
 * se llega a la compra, que es donde viven sus acciones. El interés de una cuota
 * es la excepción: abre su propio detalle, donde se ajusta al monto del extracto.
 */
export function isFromCardPurchase(tx: Pick<Transaction, "cardPurchaseId" | "cardChargeKind">): boolean {
  return !!tx.cardPurchaseId && tx.cardChargeKind !== "interes";
}

/** Dirección del movimiento según la configuración de tipos: "+" entra, "−" sale. */
export function signOf(tx: Pick<Transaction, "type">): string | undefined {
  return TX_TYPE_CONFIG[tx.type]?.sign;
}

// ─── Topes de las consultas ───────────────────────────────────────────────────
// El backend acota cuánto devuelve para no arrastrar payloads reactivos sin límite.
// La UI tiene que decirlo: si no, el contador «300 movimientos» se lee como el total.

export const MONTH_LIST_CAP = 300;
export const SEARCH_CAP = 200;

/** Suma por moneda. Buscando se cruzan meses y monedas, y convertir en cliente sería inventar. */
export function totalsByCurrency(transactions: Transaction[]): {
  currencies: string[];
  income: Record<string, number>;
  expense: Record<string, number>;
} {
  const income: Record<string, number> = {};
  const expense: Record<string, number> = {};
  const seen = new Set<string>();
  for (const tx of transactions) {
    // Las transferencias son dos asientos de la misma plata: no entran ni salen
    if (tx.transferGroupId) continue;
    const sign = signOf(tx);
    if (sign !== "+" && sign !== "−") continue;
    seen.add(tx.currency);
    const bucket = sign === "+" ? income : expense;
    bucket[tx.currency] = (bucket[tx.currency] ?? 0) + tx.amount;
  }
  return { currencies: [...seen], income, expense };
}
