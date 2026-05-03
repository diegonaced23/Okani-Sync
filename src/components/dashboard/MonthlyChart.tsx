"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { fromCents, formatCurrency, formatMonth } from "@/lib/money";
import { Skeleton } from "@/components/ui/skeleton";

interface MonthlySummary {
  month: string;
  ingresos: number;
  gastos: number;
}

interface MonthlyChartProps {
  data: MonthlySummary[] | undefined;
  currency: string;
}

export function MonthlyChart({ data, currency }: MonthlyChartProps) {
  if (data === undefined) return <Skeleton className="h-56 rounded-xl" />;

  const chartData = (data ?? []).map((d) => ({
    ...d,
    name: formatMonth(d.month).split(" ")[0].slice(0, 3), // "Abr"
    ingresos: fromCents(d.ingresos),
    gastos: fromCents(d.gastos),
  }));

  return (
    <div className="rounded-xl bg-card border border-border p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        Tendencia — últimos 6 meses
      </p>
      {/* Tabla de datos accesible para lectores de pantalla */}
      <table className="sr-only">
        <caption>Resumen mensual — últimos 6 meses</caption>
        <thead>
          <tr>
            <th scope="col">Mes</th>
            <th scope="col">Ingresos</th>
            <th scope="col">Gastos</th>
          </tr>
        </thead>
        <tbody>
          {chartData.map((d) => (
            <tr key={d.month}>
              <td>{d.name}</td>
              <td>{formatCurrency(d.ingresos, currency)}</td>
              <td>{formatCurrency(d.gastos, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div role="img" aria-label="Gráfico de líneas: tendencia de ingresos y gastos de los últimos 6 meses">
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) =>
              v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${(v / 1000).toFixed(0)}k`
            }
          />
          <Tooltip
            formatter={(value, name) => [
              formatCurrency(Number(value ?? 0), currency),
              name === "ingresos" ? "Ingresos" : "Gastos",
            ]}
            contentStyle={{
              backgroundColor: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              fontSize: "12px",
            }}
          />
          <Legend
            formatter={(value) => (
              <span style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>
                {value === "ingresos" ? "Ingresos" : "Gastos"}
              </span>
            )}
          />
          <Line
            type="monotone"
            dataKey="ingresos"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="gastos"
            stroke="var(--danger)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}
