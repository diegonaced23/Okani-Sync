"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Activity, ShieldCheck } from "lucide-react";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Skeleton } from "@/components/ui/skeleton";
import { useBalanceHidden } from "@/hooks/use-balance-hidden";
import { EASE_OUT_EXPO, GLASS_SURFACE, tint } from "@/lib/ios";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

export interface HealthMetrics {
  /** 0–100, o null si el mes anterior no tuvo ingresos */
  savingsRate: number | null;
  /** Fracción 0–1 de los ingresos comprometidos en cuotas y deudas, o null */
  dti: number | null;
  /** Hay deudas activas sin cuota mensual declarada: el dti va por debajo de lo real */
  dtiIncomplete: boolean;
  /** 0–100 del cupo usado, o null si no hay cupo registrado */
  creditUtilization: number | null;
  /** Meses que aguantarían los activos al gasto promedio, o null sin gasto */
  emergencyRunway: number | null;
  currency: string;
  missingRates: string[];
  totalAssets: number;
  avgMonthlyExpenses: number;
}

/** Meses de colchón que se consideran el objetivo; el anillo se llena ahí. */
const RUNWAY_TARGET = 6;

/**
 * Salud financiera. El backend calculaba estos cuatro indicadores —y seis datos de
 * apoyo— en cada carga del dashboard, y la pantalla solo usaba la tasa de ahorro
 * para una comparación: el resto se descartaba.
 *
 * Cada anillo muestra «—» cuando el dato no existe (sin ingresos el mes pasado, sin
 * cupo registrado, sin gastos con los que estimar) en lugar de inventar un cero.
 */
export function HealthCard({ data }: { data: HealthMetrics | undefined }) {
  const reduce = useReducedMotion();
  const [hidden] = useBalanceHidden();

  if (!data) return <div className={cn("h-[210px] animate-pulse rounded-[22px]", GLASS_SURFACE)} />;

  const { savingsRate, dti, creditUtilization, emergencyRunway, currency } = data;
  const dtiPct = dti === null ? null : dti * 100;

  const metrics = [
    {
      key: "savings",
      label: "Ahorro",
      hint: "del ingreso del mes pasado",
      value: savingsRate,
      display: savingsRate === null ? "—" : `${Math.round(savingsRate)}%`,
      ring: savingsRate === null ? 0 : Math.min(savingsRate / 100, 1),
      // Ahorrar más es mejor: el verde está arriba
      tone: toneFor(savingsRate, [{ max: 5, tone: "magenta" }, { max: 15, tone: "orange" }], "lime"),
      empty: savingsRate === null ? "Sin ingresos el mes pasado" : null,
    },
    {
      key: "utilization",
      label: "Cupo usado",
      hint: "de tus tarjetas",
      value: creditUtilization,
      display: creditUtilization === null ? "—" : `${Math.round(creditUtilization)}%`,
      ring: creditUtilization === null ? 0 : Math.min(creditUtilization / 100, 1),
      // Aquí menos es mejor
      tone: toneFor(creditUtilization, [{ max: 30, tone: "lime" }, { max: 60, tone: "orange" }], "magenta"),
      empty: creditUtilization === null ? "Sin cupo registrado" : null,
    },
    {
      key: "dti",
      label: "Comprometido",
      hint: dti === null ? "de tus ingresos" : data.dtiIncomplete ? "dato parcial" : "de tus ingresos",
      value: dtiPct,
      display: dtiPct === null ? "—" : `${Math.round(dtiPct)}%`,
      ring: dtiPct === null ? 0 : Math.min(dtiPct / 100, 1),
      tone: toneFor(dtiPct, [{ max: 30, tone: "lime" }, { max: 40, tone: "orange" }], "magenta"),
      empty: dti === null ? "Sin cuotas ni deudas declaradas" : null,
    },
    {
      key: "runway",
      label: "Colchón",
      hint: `meses al gasto habitual`,
      value: emergencyRunway,
      display:
        emergencyRunway === null
          ? "—"
          : emergencyRunway >= 99
            ? "99+"
            : emergencyRunway.toLocaleString("es-CO", { maximumFractionDigits: 1 }),
      // El colchón no tiene techo natural: el anillo se llena a los seis meses
      ring: emergencyRunway === null ? 0 : Math.min(emergencyRunway / RUNWAY_TARGET, 1),
      tone: toneFor(emergencyRunway, [{ max: 1, tone: "magenta" }, { max: 3, tone: "orange" }], "lime"),
      empty: emergencyRunway === null ? "Aún sin gastos que promediar" : null,
    },
  ];

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
      className={cn("relative overflow-hidden rounded-[22px] p-5", GLASS_SURFACE)}
      aria-label="Salud financiera"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-12 -top-14 h-44 w-44 rounded-full bg-[var(--os-violet)] opacity-[0.12] blur-3xl"
      />

      <div className="relative flex items-center gap-2">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 items-center justify-center rounded-full"
          style={{ background: tint("var(--os-violet)", 16), color: "var(--os-violet-text)" }}
        >
          <Activity className="h-4 w-4" />
        </span>
        <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          Salud financiera
        </h2>
      </div>

      <ul className="relative mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {metrics.map((m, i) => (
          <li key={m.key} className="flex flex-col items-center gap-2 text-center">
            <ProgressRing
              value={m.ring}
              color={`var(--os-${m.tone})`}
              size={68}
              stroke={7}
              label={
                m.empty
                  ? `${m.label}: sin datos`
                  : `${m.label}: ${m.display}${m.key === "runway" ? " meses" : ""}`
              }
            >
              <motion.span
                initial={reduce ? false : { opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35, ease: EASE_OUT_EXPO, delay: 0.1 + i * 0.06 }}
                className="font-mono-num text-[15px] font-extrabold tabular-nums text-foreground"
              >
                {m.display}
              </motion.span>
            </ProgressRing>

            <div className="space-y-0.5">
              <p className="text-xs font-bold text-foreground">{m.label}</p>
              <p className="text-[10px] leading-tight text-muted-foreground">
                {m.empty ?? m.hint}
              </p>
            </div>
          </li>
        ))}
      </ul>

      {/* Datos de apoyo que también venían en la query y no se veían */}
      {data.avgMonthlyExpenses > 0 && (
        <p className="relative mt-4 flex items-center gap-1.5 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
          Tienes{" "}
          <strong className="font-mono-num tabular-nums text-foreground">
            {hidden ? "$ ••••••" : formatCents(data.totalAssets, currency)}
          </strong>{" "}
          y gastas{" "}
          <strong className="font-mono-num tabular-nums text-foreground">
            {hidden ? "$ ••••••" : formatCents(Math.round(data.avgMonthlyExpenses), currency)}
          </strong>{" "}
          al mes en promedio.
        </p>
      )}

      {data.dtiIncomplete && dti !== null && (
        <p className="relative mt-2 text-[11px] text-muted-foreground/80">
          Hay deudas sin cuota mensual registrada, así que lo comprometido puede ser mayor.
        </p>
      )}

      {data.missingRates.length > 0 && (
        <p className="relative mt-2 text-[11px] text-muted-foreground/80">
          Sin tasa de cambio para {data.missingRates.join(", ")}: algunos montos quedan fuera.
        </p>
      )}
    </motion.section>
  );
}

/** Skeleton con la altura real de la tarjeta, para que la ruta no salte. */
export function HealthCardSkeleton() {
  return <Skeleton className="h-[210px] rounded-[22px]" />;
}

/**
 * Tono según umbrales, evaluados en orden. `null` cae en neutro porque no hay nada
 * que juzgar: un indicador sin datos no es ni bueno ni malo.
 */
function toneFor(
  value: number | null,
  thresholds: { max: number; tone: string }[],
  fallback: string
): string {
  if (value === null) return "cyan";
  for (const t of thresholds) {
    if (value < t.max) return t.tone;
  }
  return fallback;
}
