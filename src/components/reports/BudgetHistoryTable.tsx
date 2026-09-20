"use client";

import { Fragment } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { formatCents, formatMonth } from "@/lib/money";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus, FileDown } from "lucide-react";
import { useBalanceHidden } from "@/hooks/use-balance-hidden";
import { EASE_OUT_EXPO, GLASS_SURFACE, haptic, tint } from "@/lib/ios";
import { downloadCsv } from "@/lib/reports";
import { cn } from "@/lib/utils";

interface MonthData {
  budgeted: number;
  spent: number;
  hasBudget: boolean;
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
    /** Moneda a la que la query ya convirtió todos los importes */
    currency: string;
    /** Algún presupuesto quedó fuera por no tener tasa de cambio */
    missingRate: boolean;
  } | null | undefined;
}

const MASK = "$ ••••••";

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

function exportCsv(result: NonNullable<BudgetHistoryTableProps["result"]>) {
  const { rows, months, currency } = result;
  const headers = [
    "Categoría",
    ...months.flatMap((m) => [
      `Presupuestado (${formatMonth(m)})`,
      `Gastado (${formatMonth(m)})`,
      `% Ejec. (${formatMonth(m)})`,
    ]),
    "Tendencia",
    "Moneda",
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
      // La query convirtió todo a una sola moneda: decirlo evita que la hoja de
      // cálculo se lea como si cada columna estuviera en la moneda del presupuesto.
      currency,
    ];
  });

  const csv = [headers, ...dataRows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const monthRange = `${months[0]}_${months[months.length - 1]}`;
  downloadCsv(csv, `presupuesto_historico_${monthRange}.csv`);
}

// ── Componente ────────────────────────────────────────────────────────────────

export function BudgetHistoryTable({ result }: BudgetHistoryTableProps) {
  const reduce = useReducedMotion();
  const [hidden] = useBalanceHidden();

  if (result === undefined) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-9 w-32 rounded-full" />
        <Skeleton className="h-64 rounded-[24px]" />
      </div>
    );
  }

  if (!result || result.rows.length === 0) {
    return (
      <div className={cn("rounded-[24px] py-12 text-center", GLASS_SURFACE)}>
        <p className="text-sm font-semibold text-foreground">
          Sin presupuestos en este período
        </p>
        <p className="mx-auto mt-1.5 max-w-xs text-xs text-muted-foreground">
          Crea presupuestos en la sección de Presupuestos y aquí verás cómo te fue mes a mes.
        </p>
      </div>
    );
  }

  const { rows, months, totals, currency, missingRate } = result;
  const money = (cents: number) => (hidden ? MASK : formatCents(cents, currency));

  const shortMonths = months.map((m) => {
    const [y, mo] = m.split("-").map(Number);
    const d = new Date(y, mo - 1, 1);
    return d.toLocaleDateString("es-CO", { month: "short", year: "2-digit" });
  });

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
      className="space-y-3"
    >
      {/* Botón de exportación */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => { haptic(); exportCsv(result); }}
          className={cn(
            "touch-hit inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-bold text-foreground transition-transform active:scale-[0.97]",
            GLASS_SURFACE,
          )}
        >
          <span
            aria-hidden="true"
            className="flex h-5 w-5 items-center justify-center rounded-full"
            style={{ background: tint("var(--os-lime)", 20), color: "var(--os-lime-text)" }}
          >
            <FileDown size={12} />
          </span>
          Exportar CSV
        </button>
      </div>

      {/* Tabla con scroll horizontal */}
      <div className={cn("overflow-hidden rounded-[24px]", GLASS_SURFACE)}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-max">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sticky left-0 bg-[var(--surface)] min-w-[130px]">
                  Categoría
                </th>
                {months.map((m, i) => (
                  <th
                    key={m}
                    colSpan={3}
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
                <th scope="col" className="px-4 py-1 sticky left-0 bg-[var(--surface)]" />
                {/* Cada mes abre tres columnas. Iban dentro de un fragmento sin key,
                    así que React reconciliaba las celdas por posición y avisaba en
                    consola en cada render. */}
                {months.map((m) => (
                  <Fragment key={m}>
                    <th scope="col" className="px-3 py-1 text-right font-medium border-l border-border/50">Presup.</th>
                    <th scope="col" className="px-3 py-1 text-right font-medium">Gastado</th>
                    <th scope="col" className="px-3 py-1 text-right font-medium">% Ejec.</th>
                  </Fragment>
                ))}
                <th scope="col" className="border-l border-border/50" />
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const trend = computeTrend(row.data);
                return (
                  <tr key={row.categoryId} className="hover:bg-muted/20 transition-colors">
                    {/* Categoría — sticky en scroll horizontal */}
                    <td className="px-4 py-2.5 font-medium text-foreground sticky left-0 bg-[var(--surface)] text-sm">
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
                        <Fragment key={months[i]}>
                          {/* El presupuesto de cada mes no se veía en ninguna parte,
                              aunque el CSV sí lo exportaba y el encabezado ya reservaba
                              el espacio: un % de ejecución sin su base no se puede leer. */}
                          <td className="px-3 py-2.5 text-right tabular-nums text-sm border-l border-border/50 text-muted-foreground">
                            {d.hasBudget ? money(d.budgeted) : <span className="text-muted-foreground/40">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-sm">
                            {d.hasBudget
                              ? <span style={{ color }}>{money(d.spent)}</span>
                              : <span className="text-muted-foreground/40">—</span>
                            }
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
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
                        </Fragment>
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
                <td className="px-4 py-2.5 text-sm text-foreground sticky left-0 bg-[var(--surface)]">
                  Total
                </td>
                {totals.map((t, i) => {
                  const p = pct(t.spent, t.budgeted);
                  const color = pctColor(p);
                  return (
                    <Fragment key={months[i]}>
                      <td className="px-3 py-2.5 text-right tabular-nums text-sm border-l border-border/50 text-muted-foreground">
                        {money(t.budgeted)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-sm">
                        <span style={{ color }}>{money(t.spent)}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span
                          className="inline-block rounded-md px-1.5 py-0.5 text-[11px] font-bold"
                          style={{ color, background: `color-mix(in oklch, ${color} 15%, transparent)` }}
                        >
                          {pctLabel(p)}
                        </span>
                      </td>
                    </Fragment>
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

      {missingRate && (
        <p className="text-[11px] text-muted-foreground/80">
          Falta la tasa de cambio de algún presupuesto en otra moneda: esos importes
          quedan fuera de la comparación en vez de sumarse sin convertir.
        </p>
      )}
    </motion.div>
  );
}
