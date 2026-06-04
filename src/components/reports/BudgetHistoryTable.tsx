"use client";

import { useMemo } from "react";
import { formatCents, formatMonth } from "@/lib/money";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/reports";

interface MonthData {
  budgeted: number;
  spent: number;
  hasBudget: boolean;
  currency: string;
}

interface HistoryRow {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  data: MonthData[];
}

interface BudgetHistoryTableProps {
  result: {
    rows: HistoryRow[];
    months: string[];
    totals: { budgeted: number; spent: number }[];
  } | null | undefined;
  currency: string;
}

// ── Utilidades ────────────────────────────────────────────────────────────────

function pct(spent: number, budgeted: number): number | null {
  if (budgeted <= 0) return null;
  return (spent / budgeted) * 100;
}

function pctColor(p: number | null): string {
  if (p === null) return "var(--muted-foreground)";
  if (p > 100) return "var(--destructive)";
  if (p > 80)  return "#F59E0B";
  return "var(--os-lime)";
}

function pctLabel(p: number | null): string {
  if (p === null) return "—";
  return `${p.toFixed(0)}%`;
}

type Trend = "up" | "down" | "stable" | "none";

function computeTrend(data: MonthData[]): Trend {
  const withBudget = data.filter((d) => d.hasBudget && d.budgeted > 0);
  if (withBudget.length < 2) return "none";
  const last = withBudget[withBudget.length - 1];
  const prev = withBudget[withBudget.length - 2];
  const lastPct = last.spent / last.budgeted;
  const prevPct = prev.spent / prev.budgeted;
  const diff = lastPct - prevPct;
  if (Math.abs(diff) < 0.02) return "stable";
  return diff < 0 ? "up" : "down";  // ↓ gasto % = mejora = up
}

function TrendBadge({ trend }: { trend: Trend }) {
  if (trend === "none") return <span className="text-muted-foreground">—</span>;
  if (trend === "stable") return <Minus size={14} className="text-muted-foreground" />;
  if (trend === "up") return <TrendingDown size={14} style={{ color: "var(--os-lime)" }} />;
  return <TrendingUp size={14} style={{ color: "var(--destructive)" }} />;
}

// ── Exportación CSV ───────────────────────────────────────────────────────────

function exportCsv(result: NonNullable<BudgetHistoryTableProps["result"]>, currency: string) {
  const { rows, months } = result;
  const headers = [
    "Categoría",
    ...months.flatMap((m) => [
      `Presupuestado (${formatMonth(m)})`,
      `Gastado (${formatMonth(m)})`,
      `% Ejec. (${formatMonth(m)})`,
    ]),
    "Tendencia",
  ];

  const dataRows = rows.map((row) => {
    const trend = computeTrend(row.data);
    const trendLabel = trend === "up" ? "Mejora ↓" : trend === "down" ? "Empeora ↑" : trend === "stable" ? "Estable" : "—";
    return [
      row.categoryName,
      ...row.data.flatMap((d) => {
        if (!d.hasBudget) return ["—", "—", "—"];
        const p = pct(d.spent, d.budgeted);
        return [
          (d.budgeted / 100).toFixed(2),
          (d.spent / 100).toFixed(2),
          p !== null ? `${p.toFixed(1)}%` : "—",
        ];
      }),
      trendLabel,
    ];
  });

  const csv = [headers, ...dataRows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const monthRange = `${months[0]}_${months[months.length - 1]}`;
  downloadCsv(csv, `presupuesto_historico_${monthRange}.csv`);
}

// ── Componente ────────────────────────────────────────────────────────────────

export function BudgetHistoryTable({ result, currency }: BudgetHistoryTableProps) {
  if (result === undefined) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
      </div>
    );
  }

  if (!result || result.rows.length === 0) {
    return (
      <div className="rounded-xl bg-card border border-border py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Sin presupuestos en el período seleccionado.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Crea presupuestos en la sección de Presupuestos para verlos aquí.
        </p>
      </div>
    );
  }

  const { rows, months, totals } = result;

  const shortMonths = months.map((m) => {
    const [y, mo] = m.split("-").map(Number);
    const d = new Date(y, mo - 1, 1);
    return d.toLocaleDateString("es-CO", { month: "short", year: "2-digit" });
  });

  return (
    <div className="space-y-3">
      {/* Botón de exportación */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => exportCsv(result, currency)}
        >
          <FileDown size={14} />
          Exportar CSV
        </Button>
      </div>

      {/* Tabla con scroll horizontal */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-max">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sticky left-0 bg-muted/30 min-w-[130px]">
                  Categoría
                </th>
                {months.map((m, i) => (
                  <th
                    key={m}
                    colSpan={2}
                    className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-l border-border/50"
                  >
                    {shortMonths[i]}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-l border-border/50 min-w-[60px]">
                  Tend.
                </th>
              </tr>
              <tr className="border-b border-border text-[10px] text-muted-foreground">
                <th className="px-4 py-1 sticky left-0 bg-card" />
                {months.map((m) => (
                  <>
                    <th key={`${m}-g`} className="px-3 py-1 text-right font-medium border-l border-border/50">Gastado</th>
                    <th key={`${m}-p`} className="px-3 py-1 text-right font-medium">% Ejec.</th>
                  </>
                ))}
                <th className="border-l border-border/50" />
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const trend = computeTrend(row.data);
                return (
                  <tr key={row.categoryId} className="hover:bg-muted/20 transition-colors">
                    {/* Categoría — sticky en scroll horizontal */}
                    <td className="px-4 py-2.5 font-medium text-foreground sticky left-0 bg-card text-sm">
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: row.categoryColor }}
                        />
                        <span className="truncate max-w-[110px]">{row.categoryName}</span>
                      </span>
                    </td>

                    {row.data.map((d, i) => {
                      const p = d.hasBudget ? pct(d.spent, d.budgeted) : null;
                      const color = pctColor(p);
                      return (
                        <>
                          <td key={`${i}-g`} className="px-3 py-2.5 text-right tabular-nums text-sm border-l border-border/50">
                            {d.hasBudget
                              ? <span style={{ color }}>{formatCents(d.spent, d.currency)}</span>
                              : <span className="text-muted-foreground/40">—</span>
                            }
                          </td>
                          <td key={`${i}-p`} className="px-3 py-2.5 text-right tabular-nums">
                            {d.hasBudget ? (
                              <span
                                className="inline-block rounded-md px-1.5 py-0.5 text-[11px] font-bold"
                                style={{
                                  color,
                                  background: `color-mix(in oklch, ${color} 15%, transparent)`,
                                }}
                              >
                                {pctLabel(p)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/40 text-[11px]">—</span>
                            )}
                          </td>
                        </>
                      );
                    })}

                    <td className="px-3 py-2.5 text-center border-l border-border/50">
                      <TrendBadge trend={trend} />
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* Fila de totales */}
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/20 font-semibold">
                <td className="px-4 py-2.5 text-sm text-foreground sticky left-0 bg-muted/20">
                  Total
                </td>
                {totals.map((t, i) => {
                  const p = pct(t.spent, t.budgeted);
                  const color = pctColor(p);
                  return (
                    <>
                      <td key={`tot-${i}-g`} className="px-3 py-2.5 text-right tabular-nums text-sm border-l border-border/50">
                        <span style={{ color }}>{formatCents(t.spent, currency)}</span>
                      </td>
                      <td key={`tot-${i}-p`} className="px-3 py-2.5 text-right">
                        <span
                          className="inline-block rounded-md px-1.5 py-0.5 text-[11px] font-bold"
                          style={{ color, background: `color-mix(in oklch, ${color} 15%, transparent)` }}
                        >
                          {pctLabel(p)}
                        </span>
                      </td>
                    </>
                  );
                })}
                <td className="border-l border-border/50" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <TrendingDown size={11} style={{ color: "var(--os-lime)" }} /> Mejora (% baja)
        </span>
        <span className="flex items-center gap-1">
          <TrendingUp size={11} style={{ color: "var(--destructive)" }} /> Empeora (% sube)
        </span>
        <span className="flex items-center gap-1">
          <Minus size={11} /> Sin cambio
        </span>
      </div>
    </div>
  );
}
