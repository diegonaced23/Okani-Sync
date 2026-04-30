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
