import Papa from "papaparse";
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

const TYPE_LABELS: Record<string, string> = {
  ingreso:            "Ingreso",
  gasto:              "Gasto",
  transferencia:      "Transferencia",
  pago_tarjeta:       "Pago tarjeta",
  pago_deuda:         "Pago deuda",
  gasto_tarjeta:      "Gasto tarjeta",
  ajuste:             "Ajuste saldo",
  prestamo_otorgado:  "Préstamo otorgado",
  prestamo_cobrado:   "Cobro de préstamo",
};

// ─── CSV ───────────────────────────────────────────────────────────────────────

export function generateCsv(rows: ReportRow[]): string {
  const data = rows.map((r) => ({
    Fecha: formatDateShort(r.date),
    Descripción: r.description,
    Categoría: r.category,
    Tipo: TYPE_LABELS[r.type] ?? r.type,
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

const TX_TYPE_LABELS: Record<string, string> = {
  ingreso:           "Ingreso",
  gasto:             "Gasto",
  transferencia:     "Transferencia",
  pago_tarjeta:      "Pago tarjeta",
  pago_deuda:        "Pago deuda",
  gasto_tarjeta:     "Gasto tarjeta",
  ajuste:            "Ajuste saldo",
  prestamo_otorgado: "Préstamo otorgado",
  prestamo_cobrado:  "Cobro de préstamo",
};

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

export interface LedgerMaps {
  accounts: Record<string, string>;                         // id → name
  cards:    Record<string, { name: string; lastFour: string }>;
  cats:     Record<string, string>;                         // id → name
}

/**
 * Genera el CSV del libro completo de movimientos en formato contable.
 *
 * Columnas: Fecha · Descripción · Tipo · Debe · Haber · Saldo neto acum. · Fuente · Categoría · Moneda · Notas
 *
 * Debe/Haber:
 * - Ingresos y transferencias entrantes → Haber (crédito)
 * - Gastos, pagos y transferencias salientes → Debe (débito)
 * - Ajustes → Haber (no hay forma de distinguir signo del monto; el usuario lo interpreta)
 * - `gasto_tarjeta` → Debe (gasto comprometido, sin salida inmediata de efectivo)
 *
 * El saldo neto acumulado es la suma corriente de (Haber − Debe). En extractos
 * multi-moneda los montos se suman sin conversión — el campo "Moneda" permite
 * que el usuario aplique sus propias tasas en una hoja de cálculo.
 */
export function generateFullLedgerCsv(txs: LedgerTx[], maps: LedgerMaps): string {
  let runningBalance = 0;

  const data = txs.map((tx) => {
    const isCredit =
      tx.type === "ingreso" ||
      tx.type === "prestamo_cobrado" ||
      (tx.type === "transferencia" && tx.transferDirection === "in");

    const debe  = isCredit ? 0 : tx.amount;
    const haber = isCredit ? tx.amount : 0;
    runningBalance += haber - debe;

    const accountName = tx.accountId ? (maps.accounts[tx.accountId] ?? "—") : undefined;
    const cardName    = tx.cardId
      ? `${maps.cards[tx.cardId]?.name ?? "Tarjeta"} ····${maps.cards[tx.cardId]?.lastFour ?? "????"}` : undefined;
    const source      = accountName ?? cardName ?? "—";

    return {
      Fecha:            formatDateShort(tx.date),
      Descripción:      tx.description,
      Tipo:             TX_TYPE_LABELS[tx.type] ?? tx.type,
      Debe:             debe > 0 ? (debe / 100).toFixed(2) : "",
      Haber:            haber > 0 ? (haber / 100).toFixed(2) : "",
      "Saldo neto acum.": (runningBalance / 100).toFixed(2),
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
