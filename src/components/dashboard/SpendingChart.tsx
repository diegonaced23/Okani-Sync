"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { formatCents } from "@/lib/money";
import { Skeleton } from "@/components/ui/skeleton";

interface SpendingChartProps {
  data: { name: string; amount: number; color: string }[] | undefined;
  currency: string;
}

export function SpendingChart({ data, currency }: SpendingChartProps) {
  if (data === undefined) return <Skeleton className="h-56 rounded-xl" />;

  const filtered = (data ?? []).filter((d) => d.amount > 0);

  if (filtered.length === 0) {
    return (
      <div className="h-56 flex items-center justify-center rounded-xl bg-card border border-border">
        <p className="text-sm text-muted-foreground">Sin gastos este mes.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-card border border-border p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        Gastos por categoría
      </p>
      <div role="img" aria-label="Gráfico circular de gastos por categoría este mes">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={filtered}
              dataKey="amount"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              paddingAngle={2}
            >
              {filtered.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => [formatCents(Number(value ?? 0), currency), ""]}
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
                  {value}
                </span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {/* Tabla de datos accesible para lectores de pantalla */}
      <table className="sr-only">
        <caption>Gastos por categoría este mes</caption>
        <thead>
          <tr>
            <th scope="col">Categoría</th>
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
