"use client";

import { memo } from "react";
import { formatCents } from "@/lib/money";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingDown, CreditCard, Shield, AlertTriangle } from "lucide-react";

type MetricStatus = "good" | "warn" | "bad" | "neutral";

interface HealthMetric {
  label: string;
  value: string;
  subtext?: string;
  status: MetricStatus;
  Icon: React.ElementType;
}

interface HealthScoreCardProps {
  data: {
    savingsRate: number | null;
    dti: number | null;
    dtiIncomplete: boolean;
    creditUtilization: number | null;
    emergencyRunway: number | null;
    currency: string;
    avgMonthlyExpenses: number;
    totalMonthlyCommitments: number;
    missingRates?: string[];
  } | null | undefined;
  loading?: boolean;
}

// Clases estáticas (Tailwind necesita el nombre completo en el código fuente para generarlas
// — no se pueden interpolar dinámicamente). Deco = borde izq./ícono, pueden ser vivos.
// Text = color de valores numéricos, garantiza contraste ≥4.5:1.
const STATUS_CLASSES: Record<MetricStatus, { border: string; icon: string; text: string }> = {
  good:    { border: "border-l-lime",             icon: "text-lime",             text: "text-lime-text" },
  warn:    { border: "border-l-warning",          icon: "text-warning",          text: "text-warning-text" },
  bad:     { border: "border-l-destructive",      icon: "text-destructive",      text: "text-destructive" },
  neutral: { border: "border-l-muted-foreground", icon: "text-muted-foreground", text: "text-muted-foreground" },
};

// Etiquetas de estado en español para lectores de pantalla (neutral omitido: el valor ya es "—")
const STATUS_SR_LABELS: Partial<Record<MetricStatus, string>> = {
  good:    "bueno",
  warn:    "precaución",
  bad:     "atención",
};

function MetricChip({ metric }: { metric: HealthMetric }) {
  const classes = STATUS_CLASSES[metric.status];
  const { label, value, subtext, Icon } = metric;
  const srStatus = STATUS_SR_LABELS[metric.status];
  return (
    // min-w-0: evita desbordamiento del chip en viewports de 320px dentro del grid de 2 columnas
    <div className={`os-enter rounded-xl border border-border bg-card p-3 space-y-2 min-w-0 border-l-[3px] ${classes.border}`}>
      <div className="flex items-center gap-1.5">
        <Icon size={13} className={classes.icon} aria-hidden="true" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <p className={`text-xl font-bold tabular-nums leading-none ${classes.text}`}>
        {value}
        {srStatus && <span className="sr-only">, estado {srStatus}</span>}
      </p>
      {subtext && (
        <p className="text-[10px] text-muted-foreground leading-snug">{subtext}</p>
      )}
    </div>
  );
}

function dtiStatus(ratio: number): MetricStatus {
  if (ratio <= 0.30) return "good";
  if (ratio <= 0.50) return "warn";
  return "bad";
}

function utilizationStatus(pct: number): MetricStatus {
  if (pct <= 30) return "good";
  if (pct <= 75) return "warn";
  return "bad";
}

function runwayStatus(months: number): MetricStatus {
  if (months >= 6) return "good";
  if (months >= 3) return "warn";
  return "bad";
}

export const HealthScoreCard = memo(function HealthScoreCard({ data, loading }: HealthScoreCardProps) {
  if (loading || data === undefined) {
    return (
      <section className="space-y-2.5">
        <h2 className="text-sm font-bold text-foreground">Salud financiera</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 [&>*:last-child]:col-span-2 md:[&>*:last-child]:col-span-1">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      </section>
    );
  }

  if (data === null) return null;

  const {
    dti, dtiIncomplete,
    creditUtilization, emergencyRunway,
    currency, avgMonthlyExpenses,
    missingRates = [],
  } = data;

  // NOTA: `savingsRate` (tasa de ahorro del mes pasado) ya NO se muestra aquí.
  // Es la misma fórmula que `tasaAhorro` de monthlySavingsSummary — ahorro ÷ ingresos —
  // solo que del mes anterior, así que vivía duplicada en dos tarjetas separadas por
  // media página. SavingsCard la presenta ahora como comparativa junto al mes en curso.
  const metrics: HealthMetric[] = [
    // DTI
    {
      label: "Deuda/Ingreso",
      value: dti !== null ? `${(dti * 100).toFixed(1)}%` : "—",
      subtext: dti !== null
        ? `${dtiIncomplete ? "Parcial · " : ""}${formatCents(data.totalMonthlyCommitments, currency)}/mes`
        : dtiIncomplete ? "Sin cuota en deudas activas" : "Sin compromisos",
      status: dti !== null ? dtiStatus(dti) : "neutral",
      Icon: TrendingDown,
    },
    // Utilización de crédito
    {
      label: "Crédito usado",
      value: creditUtilization !== null ? `${creditUtilization.toFixed(1)}%` : "—",
      subtext: creditUtilization !== null
        ? `de tus límites de tarjeta`
        : "Sin tarjetas",
      status: creditUtilization !== null ? utilizationStatus(creditUtilization) : "neutral",
      Icon: CreditCard,
    },
    // Runway de emergencia
    {
      label: "Meses de reserva",
      value: emergencyRunway !== null
        ? emergencyRunway >= 100 ? "100+" : emergencyRunway.toFixed(1)
        : "—",
      subtext: emergencyRunway !== null
        ? `Gasto prom.: ${formatCents(avgMonthlyExpenses, currency)}/mes`
        : avgMonthlyExpenses === 0 ? "Sin gastos registrados" : "Sin saldo",
      status: emergencyRunway !== null ? runwayStatus(emergencyRunway) : "neutral",
      Icon: Shield,
    },
  ];

  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-foreground">Salud financiera</h2>
        <span className="text-xs text-muted-foreground">Último mes completo</span>
      </div>
      {/* 3 KPIs en 2 columnas dejarían un hueco en móvil: el último ocupa el ancho */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 [&>*:last-child]:col-span-2 md:[&>*:last-child]:col-span-1">
        {metrics.map((m) => (
          <MetricChip key={m.label} metric={m} />
        ))}
      </div>
      {missingRates.length > 0 && (
        <div
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
          title={`Tasas no disponibles para ${missingRates.join(", ")}. Se actualizan automáticamente cada día.`}
        >
          <AlertTriangle size={12} aria-hidden="true" />
          <span>Tasas no disponibles: {missingRates.join(", ")} — indicadores pueden ser inexactos</span>
        </div>
      )}
    </section>
  );
});
