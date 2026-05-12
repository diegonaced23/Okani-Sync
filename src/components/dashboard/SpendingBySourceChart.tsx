"use client";

import { fromCents, formatCents } from "@/lib/money";
import { Skeleton } from "@/components/ui/skeleton";

interface SpendingBySourceChartProps {
  data: { name: string; amount: number; color: string }[] | undefined;
  currency: string;
}

// Paleta fija para las barras del chart — ignora los colores de cuenta (son gradientes CSS)
const CHART_COLORS: [string, string][] = [
  ["var(--os-lime)",    "var(--os-lime-2)"],
  ["var(--os-cyan)",    "var(--os-cyan-2)"],
  ["var(--os-orange)",  "var(--os-orange-2)"],
  ["var(--os-magenta)", "var(--os-magenta-2)"],
  ["oklch(0.65 0.18 300)", "oklch(0.75 0.14 300)"],  // violeta
  ["oklch(0.72 0.16 180)", "oklch(0.82 0.12 180)"],  // esmeralda
];

function tickFormatter(cents: number): string {
  const v = fromCents(cents);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}k`;
  return String(v);
}

function truncate(s: string, max = 18): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export function SpendingBySourceChart({ data, currency }: SpendingBySourceChartProps) {
  if (data === undefined) return <Skeleton className="h-48 rounded-xl" />;

  const filtered = (data ?? []).filter((d) => d.amount > 0);

  if (filtered.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center rounded-xl bg-card border border-border">
        <p className="text-sm text-muted-foreground">Sin gastos este mes.</p>
      </div>
    );
  }

  const total = filtered.reduce((s, d) => s + d.amount, 0);
  const max   = filtered[0].amount; // ya viene ordenado desc

  return (
    <div className="rounded-xl bg-card border border-border p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
        Gastos por fuente
      </p>

      <div role="img" aria-label="Gastos por cuenta y tarjeta este mes" className="space-y-3">
        {filtered.map((d, i) => {
          const [from, to] = CHART_COLORS[i % CHART_COLORS.length];
          const pct = max > 0 ? (d.amount / max) * 100 : 0;
          const sharePct = total > 0 ? Math.round((d.amount / total) * 100) : 0;

          return (
            <div key={d.name} className="space-y-1">
              {/* Nombre + monto */}
              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ background: from }}
                    aria-hidden="true"
                  />
                  <span className="text-xs font-medium text-foreground truncate">
                    {truncate(d.name)}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs tabular-nums font-semibold text-foreground">
                    {tickFormatter(d.amount)}
                  </span>
                  <span
                    className="text-[10px] tabular-nums rounded-full px-1.5 py-0.5 font-medium"
                    style={{
                      background: `color-mix(in oklch, ${from} 15%, transparent)`,
                      color: from,
                    }}
                  >
                    {sharePct}%
                  </span>
                </div>
              </div>

              {/* Barra de progreso */}
              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ background: "var(--surface-2, var(--muted))" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${from}, ${to})`,
                    minWidth: pct > 0 ? "6px" : "0",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Total */}
      <div
        className="mt-4 pt-3 flex items-center justify-between"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <span className="text-xs text-muted-foreground">Total gastado</span>
        <span className="text-sm font-bold tabular-nums text-foreground">
          {formatCents(total, currency)}
        </span>
      </div>

      {/* Tabla accesible para lectores de pantalla */}
      <table className="sr-only">
        <caption>Gastos por cuenta y tarjeta este mes</caption>
        <thead>
          <tr>
            <th scope="col">Fuente</th>
            <th scope="col">Monto</th>
            <th scope="col">Porcentaje</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((d) => (
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
}
