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

// ─── Extracto de tarjeta de crédito ──────────────────────────────────────────

export interface CardStatementRow {
  description: string;
  category: string;
  purchaseDate: number;
  paidInstallments: number;
  totalInstallments: number;
  amountPerInstallment: number; // en centavos
  totalAmount: number;          // monto base sin interés, en centavos
  totalWithInterest: number;    // en centavos
  totalInterest: number;        // en centavos
  hasInterest: boolean;
  interestRate?: number;        // decimal (0.08 = 8%)
  status: string;
  currency: string;
}

/**
 * Genera el CSV del extracto de una tarjeta de crédito.
 * Una fila por compra activa.
 */
export function generateCardStatementCsv(rows: CardStatementRow[]): string {
  const data = rows.map((r) => ({
    Descripción: r.description,
    Categoría: r.category || "Sin categoría",
    "Fecha de compra": formatDateShort(r.purchaseDate),
    "Cuotas pagadas": r.paidInstallments,
    "Total cuotas": r.totalInstallments,
    "Cuota mensual": formatCents(r.amountPerInstallment, r.currency),
    "Monto base": formatCents(r.totalAmount, r.currency),
    "Total con interés": formatCents(r.totalWithInterest, r.currency),
    "Interés total": formatCents(r.totalInterest, r.currency),
    "Con interés": r.hasInterest ? "Sí" : "No",
    "Tasa mensual": r.hasInterest && r.interestRate
      ? `${(r.interestRate * 100).toFixed(2)}%`
      : "—",
    Estado: r.status === "activa" ? "Activa" : r.status === "pagada" ? "Pagada" : "Cancelada",
    Moneda: r.currency,
  }));

  return Papa.unparse(data, { delimiter: ",", header: true });
}
