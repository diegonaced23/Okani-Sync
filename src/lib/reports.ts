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
  ingreso: "Ingreso",
  gasto: "Gasto",
  transferencia: "Transferencia",
  pago_tarjeta: "Pago tarjeta",
  pago_deuda: "Pago deuda",
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

// ─── PDF — se genera en el componente con dynamic import de @react-pdf ────────
// Ver src/components/reports/ReportDocument.tsx

// ─── Extracto "A pagar" de tarjeta de crédito ────────────────────────────────
// Una fila por CUOTA, no por compra. Refleja exactamente el tab "A pagar".

export interface PaymentStatementRow {
  status: "Vencida" | "Ciclo actual";   // sección del tab donde aparece
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
