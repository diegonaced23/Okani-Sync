"use client";

import { useState } from "react";
import { formatCents } from "@/lib/money";
import type { AmortizationResult } from "@/lib/money";

interface AmortizationTableProps {
  result: AmortizationResult;
  currency: string;
}

const INITIAL_ROWS = 24;

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("es-CO", { month: "short", year: "2-digit" });
}

export function AmortizationTable({ result, currency }: AmortizationTableProps) {
  const [expanded, setExpanded] = useState(false);
  const { schedule, totalInterest, totalPayments, payoffDate } = result;
  const visible = expanded ? schedule : schedule.slice(0, INITIAL_ROWS);
  const hasMore = schedule.length > INITIAL_ROWS;

  const totalPaid = schedule.reduce((s, r) => s + r.payment, 0);

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Cuotas restantes
          </p>
          <p className="text-xl font-bold text-foreground tabular-nums">{totalPayments}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Total intereses
          </p>
          <p className="text-lg font-bold tabular-nums" style={{ color: "#F59E0B" }}>
            {formatCents(totalInterest, currency)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Liquidación
          </p>
          <p className="text-lg font-bold text-foreground">{monthLabel(payoffDate)}</p>
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">#</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Mes</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Capital</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Interés</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Cuota</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((row) => (
                <tr key={row.monthNumber} className="hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums">{row.monthNumber}</td>
                  <td className="px-3 py-2.5 text-xs font-medium text-foreground">{monthLabel(row.month)}</td>
                  <td className="px-3 py-2.5 text-xs text-right tabular-nums" style={{ color: "var(--os-lime)" }}>
                    {formatCents(row.principal, currency)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-right tabular-nums" style={{ color: "#F59E0B" }}>
                    {formatCents(row.interest, currency)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-right tabular-nums font-semibold text-foreground">
                    {formatCents(row.payment, currency)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-right tabular-nums text-muted-foreground">
                    {formatCents(row.remainingBalance, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Fila de totales */}
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/30">
                <td className="px-3 py-2.5 text-xs font-bold text-foreground" colSpan={2}>Total</td>
                <td className="px-3 py-2.5 text-xs text-right tabular-nums font-bold" style={{ color: "var(--os-lime)" }}>
                  {formatCents(totalPaid - totalInterest, currency)}
                </td>
                <td className="px-3 py-2.5 text-xs text-right tabular-nums font-bold" style={{ color: "#F59E0B" }}>
                  {formatCents(totalInterest, currency)}
                </td>
                <td className="px-3 py-2.5 text-xs text-right tabular-nums font-bold text-foreground">
                  {formatCents(totalPaid, currency)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        {hasMore && (
          <div className="border-t border-border px-4 py-3 text-center">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded
                ? "Mostrar menos"
                : `Ver las ${schedule.length - INITIAL_ROWS} cuotas restantes`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
