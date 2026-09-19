"use client";

import { motion, useReducedMotion } from "framer-motion";
import { formatCents } from "@/lib/money";
import { EASE_OUT_EXPO, GLASS_SURFACE } from "@/lib/ios";
import { cn } from "@/lib/utils";

/**
 * Cuánto comprometen los recurrentes cada mes: lo que sale, lo que entra y qué
 * parte de los ingresos fijos se llevan los gastos fijos.
 */
export function SummaryCard({
  summary,
  nextUp,
}: {
  summary: { currency: string; monthlyExpense: number; monthlyIncome: number; missingRate: boolean } | undefined;
  nextUp: { description: string; when: string } | undefined;
}) {
  const reduce = useReducedMotion();
  if (!summary) {
    return <div className={cn("h-[168px] animate-pulse rounded-[28px]", GLASS_SURFACE)} />;
  }
  const { currency, monthlyExpense, monthlyIncome } = summary;
  const net = monthlyIncome - monthlyExpense;
  const ratio = monthlyIncome > 0 ? monthlyExpense / monthlyIncome : null;

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
      className={cn("relative overflow-hidden rounded-[28px] p-5", GLASS_SURFACE)}
      aria-label="Compromiso mensual"
    >
      <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-[var(--os-magenta)] opacity-[0.12] blur-3xl" />
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-[var(--os-lime)] opacity-[0.14] blur-3xl" />

      <p className="relative text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        Gastos fijos al mes
      </p>
      <p className="relative mt-1 font-mono-num text-[32px] font-extrabold leading-none tracking-tight text-foreground tabular-nums">
        {formatCents(monthlyExpense, currency)}
      </p>

      {/* Qué parte de los ingresos fijos se llevan los gastos fijos */}
      {ratio !== null && (
        <div className="relative mt-4 space-y-1.5">
          <div className="h-2 overflow-hidden rounded-full bg-[color-mix(in_oklch,var(--os-lime)_22%,transparent)]">
            <motion.div
              className={cn("h-full rounded-full", ratio > 1 ? "bg-[var(--os-magenta)]" : "bg-[var(--os-orange)]")}
              initial={reduce ? false : { width: 0 }}
              animate={{ width: `${Math.min(ratio, 1) * 100}%` }}
              transition={{ duration: 0.8, ease: EASE_OUT_EXPO, delay: 0.15 }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {ratio > 1
              ? "Tus gastos fijos superan tus ingresos fijos."
              : <>Se llevan el <strong className="text-foreground">{Math.round(ratio * 100)}%</strong> de tus ingresos fijos.</>}
          </p>
        </div>
      )}

      {monthlyIncome > 0 ? (
        <div className="relative mt-4 grid grid-cols-2 gap-2">
          <Stat label="Ingresos fijos" value={`+${formatCents(monthlyIncome, currency)}`} className="text-lime-text" />
          <Stat
            label="Te queda"
            value={`${net < 0 ? "−" : ""}${formatCents(Math.abs(net), currency)}`}
            className={net < 0 ? "text-[var(--os-magenta)]" : "text-foreground"}
          />
        </div>
      ) : (
        <p className="relative mt-3 text-xs text-muted-foreground">
          Agrega tus ingresos fijos, como el salario, para ver cuánto te queda cada mes.
        </p>
      )}

      {nextUp && (
        <p className="relative mt-3 truncate text-xs text-muted-foreground">
          Próximo: <strong className="text-foreground">{nextUp.description}</strong> · {nextUp.when}
        </p>
      )}
      {summary.missingRate && (
        <p className="relative mt-1 text-[11px] text-muted-foreground/80">
          Algunos montos en otra moneda no se incluyen por falta de tasa de cambio.
        </p>
      )}
    </motion.section>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-[16px] bg-background/40 px-3 py-2.5 dark:bg-white/5">
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 truncate font-mono-num text-[15px] font-bold tabular-nums", className)}>{value}</p>
    </div>
  );
}
