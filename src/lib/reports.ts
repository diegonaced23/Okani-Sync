import Papa from "papaparse";
import { TX_TYPE_CONFIG } from "@/components/transactions/tx-type-config";
import { formatCents } from "@/lib/money";
import { formatDateShort } from "@/lib/utils";

export interface ReportRow {
  date: number;
  description: string;
  category: string;
  type: string;
  amount: number;
  currency: string;
}

/**
 * Etiqueta legible de cada tipo de movimiento, tomada de `TX_TYPE_CONFIG`, que ya
 * se declara fuente única de verdad y es la que el usuario ve en cada fila.
 *
 * Había cuatro copias de esta tabla: dos idénticas en este archivo, una de cinco
 * entradas en el PDF —que imprimía `gasto_tarjeta` en crudo— y la de
 * `TX_TYPE_CONFIG`, que además no coincidía: «Gasto con tarjeta» en pantalla frente
 * a «Gasto tarjeta» en el CSV del mismo mes, y «Reasignación bancaria» frente a
 * «Ajuste saldo». Ahora el archivo exportado dice lo mismo que la pantalla.
 */
export function txTypeLabel(type: string): string {
  return TX_TYPE_CONFIG[type]?.label ?? type;
}

// ─── CSV ───────────────────────────────────────────────────────────────────────

export function generateCsv(rows: ReportRow[]): string {
  const data = rows.map((r) => ({
    Fecha: formatDateShort(r.date),
    Descripción: r.description,
    Categoría: r.category,
    Tipo: txTypeLabel(r.type),
    Monto: formatCents(r.amount, r.currency),
    Moneda: r.currency,
  }));

  return Papa.unparse(data, { delimiter: ",", header: true });
}

export function downloadCsv(content: string, filename: string) {
  const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// ─── Libro completo de movimientos (formato contable) ─────────────────────────

export interface LedgerTx {
  _id: string;
  date: number;
  description: string;
  type: string;
  amount: number;           // centavos
  currency: string;
  accountId?: string;
  cardId?: string;
  categoryId?: string;
  transferDirection?: string;
  notes?: string;
}

/**
 * Totales de una sola moneda. Un extracto no se convierte a la tasa de hoy —es el
 * registro de lo que pasó, no una valuación—, así que los totales van agrupados:
 * antes se sumaban centavos de monedas distintas y se etiquetaban con la del perfil.
 */
export interface CurrencyTotals {
  currency: string;
  income: number;
  expense: number;
}

export interface LedgerMaps {
  accounts: Record<string, string>;                         // id → name
  cards:    Record<string, { name: string; lastFour: string }>;
  cats:     Record<string, string>;                         // id → name
}

/**
 * Genera el CSV del libro completo de movimientos en formato contable.
 *
 * Columnas: Fecha · Descripción · Tipo · Debe · Haber · Saldo acum. (moneda) · Fuente · Categoría · Moneda · Notas
 *
 * Debe/Haber:
 * - Ingresos, cobros de préstamo y transferencias entrantes → Haber (crédito)
 * - Gastos, pagos, préstamos otorgados y transferencias salientes → Debe (débito)
 * - `gasto_tarjeta` → Debe (gasto comprometido, sin salida inmediata de efectivo)
 * - Ajustes → ninguna de las dos. `reassignBalance` guarda `Math.abs(delta)`, así
 *   que el signo de la reasignación no está en el registro: clasificarla sería
 *   adivinar, y adivinar mal desplaza todo el saldo acumulado desde esa fila.
 *   La fila aparece con su tipo para que se vea que ocurrió.
 *
 * El saldo acumulado corre **por moneda**. Antes era uno solo para todo el libro,
 * de modo que en una cuenta en dólares y otra en pesos la columna sumaba unidades
 * distintas y no significaba nada en ninguna fila.
 *
 * Arranca en cero en la primera fila: es el neto del período exportado, no el saldo
 * de la cuenta. Si el período llegó al tope de la consulta, la primera fila no es el
 * principio del mes y la apertura no representa nada — por eso esos archivos se
 * descargan marcados como parciales.
 */
export function generateFullLedgerCsv(txs: LedgerTx[], maps: LedgerMaps): string {
  const runningByCurrency: Record<string, number> = {};

  const data = txs.map((tx) => {
    const isAdjustment = tx.type === "ajuste";
    const isCredit =
      tx.type === "ingreso" ||
      tx.type === "prestamo_cobrado" ||
      (tx.type === "transferencia" && tx.transferDirection === "in");

    const debe  = isAdjustment || isCredit ? 0 : tx.amount;
    const haber = isAdjustment ? 0 : isCredit ? tx.amount : 0;
    const running = (runningByCurrency[tx.currency] ?? 0) + haber - debe;
    runningByCurrency[tx.currency] = running;

    const accountName = tx.accountId ? (maps.accounts[tx.accountId] ?? "—") : undefined;
    const cardName    = tx.cardId
      ? `${maps.cards[tx.cardId]?.name ?? "Tarjeta"} ····${maps.cards[tx.cardId]?.lastFour ?? "????"}` : undefined;
    const source      = accountName ?? cardName ?? "—";

    return {
      Fecha:            formatDateShort(tx.date),
      Descripción:      tx.description,
      Tipo:             txTypeLabel(tx.type),
      Debe:             debe > 0 ? (debe / 100).toFixed(2) : "",
      Haber:            haber > 0 ? (haber / 100).toFixed(2) : "",
      "Saldo acum.":    (running / 100).toFixed(2),
      Fuente:           source,
      Categoría:        tx.categoryId ? (maps.cats[tx.categoryId] ?? "Sin categoría") : "—",
      Moneda:           tx.currency,
      Notas:            tx.notes ?? "",
    };
  });

  return Papa.unparse(data, { delimiter: ",", header: true });
}

// ─── PDF — se genera en el componente con dynamic import de @react-pdf ────────
// Ver src/components/reports/ReportDocument.tsx

// ─── Extracto "A pagar" de tarjeta de crédito ────────────────────────────────
// Una fila por CUOTA, no por compra. Refleja exactamente el tab "A pagar".

export interface PaymentStatementRow {
  status: "Vencida" | "A pagar";         // sección del tab donde aparece
  description: string;                  // descripción de la compra padre
  category: string;                     // nombre de categoría
  installmentNumber: number;            // N° de cuota
  totalInstallments: number;            // total de cuotas de la compra
  amount: number;                       // monto total de esta cuota (centavos)
  principalAmount?: number;             // capital de esta cuota (centavos)
  interestAmount?: number;              // interés de esta cuota (centavos)
  dueDate: number;                      // timestamp de vencimiento
  currency: string;
}

/**
 * Genera el CSV del extracto "A pagar".
 * Muestra las cuotas vencidas primero, luego las del ciclo actual.
 */
export function generatePaymentStatementCsv(rows: PaymentStatementRow[]): string {
  const data = rows.map((r) => ({
    Estado: r.status,
    Descripción: r.description,
    Categoría: r.category || "Sin categoría",
    Cuota: r.totalInstallments > 1 ? `${r.installmentNumber}/${r.totalInstallments}` : "—",
    Vencimiento: formatDateShort(r.dueDate),
    Monto: formatCents(r.amount, r.currency),
    Capital: r.principalAmount != null ? formatCents(r.principalAmount, r.currency) : "—",
    Interés: r.interestAmount != null && r.interestAmount > 0
      ? formatCents(r.interestAmount, r.currency)
      : "—",
    Moneda: r.currency,
  }));

  return Papa.unparse(data, { delimiter: ",", header: true });
}
