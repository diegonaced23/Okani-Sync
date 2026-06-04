"use client";

import { formatCents } from "@/lib/money";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, CreditCard, Shield } from "lucide-react";

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
    lastMonthIncome: number;
    lastMonthExpenses: number;
    avgMonthlyExpenses: number;
    totalMonthlyCommitments: number;
  } | null | undefined;
  loading?: boolean;
}

const STATUS_COLORS: Record<MetricStatus, string> = {
  good:    "var(--os-lime)",
  warn:    "#F59E0B",
  bad:     "var(--destructive)",
  neutral: "var(--muted-foreground)",
};

function MetricChip({ metric }: { metric: HealthMetric }) {
  const color = STATUS_COLORS[metric.status];
  const { label, value, subtext, Icon } = metric;
  return (
    <div
      className="rounded-xl border border-border bg-card p-3 space-y-2"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex items-center gap-1.5">
        <Icon size={13} style={{ color }} />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <p className="text-xl font-bold tabular-nums leading-none" style={{ color }}>
        {value}
      </p>
      {subtext && (
        <p className="text-[10px] text-muted-foreground leading-snug">{subtext}</p>
      )}
    </div>
  );
}

function savingsStatus(rate: number): MetricStatus {
  if (rate >= 20) return "good";
  if (rate >= 5)  return "warn";
  return "bad";
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

export function HealthScoreCard({ data, loading }: HealthScoreCardProps) {
  if (loading || data === undefined) {
    return (
      <section className="space-y-2.5">
        <h2 className="text-sm font-bold text-foreground">Salud financiera</h2>
        <div className="grid grid-cols-2 gap-2.5">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      </section>
    );
  }

  if (data === null) return null;

  const {
    savingsRate, dti, dtiIncomplete,
    creditUtilization, emergencyRunway,
    currency, lastMonthIncome, lastMonthExpenses, avgMonthlyExpenses,
  } = data;

  const metrics: HealthMetric[] = [
    // Tasa de ahorro
    {
      label: "Tasa de ahorro",
      value: savingsRate !== null ? `${savingsRate.toFixed(1)}%` : "—",
      subtext: savingsRate !== null
        ? `Ingresos: ${formatCents(lastMonthIncome, currency)}`
        : "Sin ingresos el mes pasado",
      status: savingsRate !== null ? savingsStatus(savingsRate) : "neutral",
      Icon: TrendingUp,
    },
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
      <div className="grid grid-cols-2 gap-2.5">
        {metrics.map((m) => (
          <MetricChip key={m.label} metric={m} />
        ))}
      </div>
    </section>
  );
}
