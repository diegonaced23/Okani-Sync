"use client";

import { memo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { fromCents, formatCurrency } from "@/lib/money";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus, CalendarClock } from "lucide-react";

interface Snapshot {
  month: string;
  netWorth: number;
  totalAssets: number;
  totalCardDebt: number;
  totalDebt: number;
  currency: string;
}

interface NetWorthChartProps {
  data: Snapshot[] | undefined;
  currency: string;
}

function shortMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("es-CO", { month: "short", year: "2-digit" });
}

// Estilo constante del tooltip de Recharts — externo al render para evitar nueva referencia en cada ciclo
const TOOLTIP_STYLE = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  fontSize: "12px",
} as const;

export const NetWorthChart = memo(function NetWorthChart({ data, currency }: NetWorthChartProps) {
  // Skeleton estructurado para evitar CLS: imita el header + gráfico del componente real
  if (data === undefined) {
    return (
      <div className="rounded-xl bg-card border border-border p-4">
        <div className="flex justify-between items-center mb-3">
          <Skeleton className="h-3 w-52" />
          <Skeleton className="h-4 w-14 rounded-full" />
        </div>
        <Skeleton className="h-[200px] w-full rounded-lg" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-xl bg-card border border-border p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          Evolución del patrimonio
        </h3>
        {/* CalendarClock refuerza que la acción es automática — el usuario no necesita hacer nada */}
        <div className="flex items-start gap-2 mt-3">
          <CalendarClock size={15} className="text-muted-foreground shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            El primer snapshot se capturará automáticamente el día 1 del próximo mes.
            A partir de entonces, el gráfico mostrará la evolución histórica.
          </p>
        </div>
      </div>
    );
  }

  const chartData = data.map((s) => ({
    name: shortMonth(s.month),
    netWorth: fromCents(s.netWorth),
    totalAssets: fromCents(s.totalAssets),
    rawNetWorth: s.netWorth,
  }));

  const first = chartData[0].netWorth;
  const last  = chartData[chartData.length - 1].netWorth;
  const delta = last - first;
  const deltaPct = first !== 0 ? (delta / Math.abs(first)) * 100 : 0;
  const isPositive = delta >= 0;
  const isFlat = Math.abs(delta) < 1;

  const TrendIcon = isFlat ? Minus : isPositive ? TrendingUp : TrendingDown;
  const trendColor = isFlat ? "var(--muted-foreground)" : isPositive ? "var(--os-lime)" : "var(--destructive)";

  const minVal = Math.min(...chartData.map((d) => d.netWorth));
  const hasNegative = minVal < 0;

  return (
    <div className="rounded-xl bg-card border border-border p-4">
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Evolución del patrimonio — últimos {data.length} meses
        </h3>
        {data.length >= 2 && (
          <div className="flex items-center gap-1" style={{ color: trendColor }}>
            <TrendIcon size={13} />
            <span className="text-xs font-bold tabular-nums">
              {isFlat ? "Sin cambio" : `${isPositive ? "+" : ""}${deltaPct.toFixed(1)}%`}
            </span>
          </div>
        )}
      </div>

      {/* Tabla accesible para lectores de pantalla */}
      <table className="sr-only">
        <caption>Evolución del patrimonio neto</caption>
        <thead>
          <tr><th scope="col">Mes</th><th scope="col">Patrimonio neto</th><th scope="col">Activos</th></tr>
        </thead>
        <tbody>
          {chartData.map((d) => (
            <tr key={d.name}>
              <td>{d.name}</td>
              <td>{formatCurrency(d.netWorth, currency)}</td>
              <td>{formatCurrency(d.totalAssets, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div role="img" aria-label={`Gráfico de área: evolución del patrimonio neto de los últimos ${data.length} meses`}>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="var(--os-lime)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="var(--os-lime)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            {hasNegative && (
              <CartesianGrid
                horizontal
                vertical={false}
                stroke="var(--destructive)"
                strokeDasharray="4 4"
                strokeOpacity={0.3}
              />
            )}
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
              tickFormatter={(v) => {
                const abs = Math.abs(v);
                const sign = v < 0 ? "-" : "";
                if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
                if (abs >= 1_000)    return `${sign}${(abs / 1_000).toFixed(0)}k`;
                return `${sign}${abs}`;
              }}
            />
            <Tooltip
              formatter={(value) => [formatCurrency(Number(value ?? 0), currency), "Patrimonio neto"]}
              contentStyle={TOOLTIP_STYLE}
            />
            <Area
              type="monotone"
              dataKey="netWorth"
              stroke="var(--os-lime)"
              strokeWidth={2}
              fill="url(#netWorthGradient)"
              dot={{ r: 3, fill: "var(--os-lime)", strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {data.length < 3 && (
        <p className="text-[10px] text-muted-foreground mt-2 text-center">
          Se mostrarán más datos a medida que pasen los meses.
        </p>
      )}
    </div>
  );
});
