"use client";

import { memo } from "react";
import { formatCents } from "@/lib/money";
import { Skeleton } from "@/components/ui/skeleton";

interface SpendingChartProps {
  data: { name: string; amount: number; color: string }[] | undefined;
  currency: string;
  monthName: string;
}

function truncate(s: string, max = 22): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export const SpendingChart = memo(function SpendingChart({ data, currency, monthName }: SpendingChartProps) {
  if (data === undefined) return <Skeleton className="h-56 rounded-xl" />;

  const filtered = data.filter((d) => d.amount > 0);

  if (filtered.length === 0) {
    return (
      <div className="h-56 flex items-center justify-center rounded-xl bg-card border border-border">
        <p className="text-sm text-muted-foreground">Sin gastos en {monthName}.</p>
      </div>
    );
  }

  const sorted = [...filtered].sort((a, b) => b.amount - a.amount);
  const total = sorted.reduce((s, d) => s + d.amount, 0);
  const max = sorted[0].amount;

  return (
    <div className="rounded-xl bg-card border border-border p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
        Gastos por categoría
      </h3>

      <div role="img" aria-label="Gastos por categoría este mes" className="space-y-3">
        {sorted.map((d) => {
          const pct = max > 0 ? (d.amount / max) * 100 : 0;
          const sharePct = total > 0 ? Math.round((d.amount / total) * 100) : 0;

          return (
            <div key={d.name} className="space-y-1">
              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ background: d.color }}
                    aria-hidden="true"
                  />
                  <span className="text-xs font-medium text-foreground truncate">
                    {truncate(d.name)}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs tabular-nums font-semibold text-foreground">
                    {formatCents(d.amount, currency)}
                  </span>
                  <span
                    className="text-[10px] tabular-nums rounded-full px-1.5 py-0.5 font-medium"
                    style={{
                      background: `color-mix(in oklch, ${d.color} 18%, transparent)`,
                      color: d.color,
                    }}
                  >
                    {sharePct}%
                  </span>
                </div>
              </div>

              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ background: "var(--surface-2, var(--muted))" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    background: d.color,
                    minWidth: pct > 0 ? "6px" : "0",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="mt-4 pt-3 flex items-center justify-between"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <span className="text-xs text-muted-foreground">Total en categorías</span>
        <span className="text-sm font-bold tabular-nums text-foreground">
          {formatCents(total, currency)}
        </span>
      </div>

      <table className="sr-only">
        <caption className="sr-only">Gastos por categoría este mes</caption>
        <thead>
          <tr>
            <th scope="col">Categoría</th>
            <th scope="col">Monto</th>
            <th scope="col">Porcentaje</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((d) => (
            <tr key={d.name}>
              <td>{d.name}</td>
              <td>{formatCents(d.amount, currency)}</td>
              <td>{total > 0 ? Math.round((d.amount / total) * 100) : 0}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
