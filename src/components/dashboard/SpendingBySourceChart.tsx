"use client";

import {
  BarChart, Bar, XAxis, YAxis, Cell, Tooltip,
  ResponsiveContainer, LabelList,
} from "recharts";
import { fromCents, formatCurrency, formatCents } from "@/lib/money";
import { Skeleton } from "@/components/ui/skeleton";

interface SpendingBySourceChartProps {
  data: { name: string; amount: number; color: string }[] | undefined;
  currency: string;
}

function tickFormatter(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}k`;
  return String(v);
}

function truncate(s: string, max = 14): string {
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

  const chartData = filtered.map((d) => ({
    ...d,
    value: fromCents(d.amount),
    label: truncate(d.name),
  }));

  // Altura dinámica: mínimo 180px, 44px por item
  const chartHeight = Math.max(180, chartData.length * 44);

  return (
    <div className="rounded-xl bg-card border border-border p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        Gastos por fuente
      </p>
      <div role="img" aria-label="Gráfico de barras de gastos por cuenta y tarjeta este mes">
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 0, right: 48, left: 0, bottom: 0 }}
          >
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={tickFormatter}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={108}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(value) => [formatCurrency(Number(value ?? 0), currency), ""]}
              labelFormatter={(label) => {
                const item = chartData.find((d) => d.label === label);
                return item?.name ?? label;
              }}
              contentStyle={{
                backgroundColor: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={28}>
              {chartData.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
              <LabelList
                dataKey="value"
                position="right"
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(v: any) => tickFormatter(Number(v ?? 0))}
                style={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabla accesible para lectores de pantalla */}
      <table className="sr-only">
        <caption>Gastos por cuenta y tarjeta este mes</caption>
        <thead>
          <tr>
            <th scope="col">Fuente</th>
            <th scope="col">Monto</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((d) => (
            <tr key={d.name}>
              <td>{d.name}</td>
              <td>{formatCents(d.amount, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
