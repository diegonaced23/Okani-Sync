"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ProgressRing } from "@/components/ui/progress-ring";
import { EASE_OUT_EXPO, GLASS_SURFACE, tint } from "@/lib/ios";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

export interface GoalsOverview {
  currency: string;
  saved: number;
  target: number;
  active: number;
  completed: number;
  missingRate: boolean;
}

/**
 * Cuánto llevas ahorrado del total que te propusiste. Solo cuenta las metas en
 * curso: las completadas inflarían el progreso y taparían lo que falta de verdad.
 */
export function GoalsOverviewCard({ data }: { data: GoalsOverview | undefined }) {
  const reduce = useReducedMotion();
  if (!data) return <div className={cn("h-[152px] animate-pulse rounded-[28px]", GLASS_SURFACE)} />;

  const { currency, saved, target } = data;
  const progress = target > 0 ? Math.min(saved / target, 1) : 0;
  const remaining = Math.max(0, target - saved);
  const tone = "var(--os-lime)";

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
      className={cn("relative overflow-hidden rounded-[28px] p-5", GLASS_SURFACE)}
      aria-label="Resumen de metas"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-[var(--os-lime)] opacity-[0.14] blur-3xl"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-[var(--os-cyan)] opacity-[0.12] blur-3xl"
      />

      <div className="relative flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Llevas ahorrado
          </p>
          <p className="mt-1 truncate font-mono-num text-[30px] font-extrabold leading-none tracking-tight text-foreground tabular-nums">
            {formatCents(saved, currency)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {target > 0
              ? <>Te faltan <strong className="text-foreground">{formatCents(remaining, currency)}</strong> para {formatCents(target, currency)}</>
              : "Sin metas en curso"}
          </p>
        </div>

        <ProgressRing
          value={progress}
          color={tone}
          size={84}
          stroke={8}
          label={`${Math.round(progress * 100)}% del total ahorrado`}
        >
          <span className="flex flex-col items-center leading-none">
            <span className="font-mono-num text-lg font-extrabold tabular-nums text-foreground">
              {Math.round(progress * 100)}%
            </span>
            <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              del total
            </span>
          </span>
        </ProgressRing>
      </div>

      <div className="relative mt-4 flex flex-wrap gap-2">
        <span
          className="rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{ background: tint("var(--os-cyan)", 15), color: "var(--os-cyan-text)" }}
        >
          {data.active} en progreso
        </span>
        {data.completed > 0 && (
          <span
            className="rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{ background: tint(tone, 18), color: "var(--os-lime-text)" }}
          >
            {data.completed} cumplida{data.completed > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {data.missingRate && (
        <p className="relative mt-2 text-[11px] text-muted-foreground/80">
          Algunos montos en otra moneda no se incluyen por falta de tasa de cambio.
        </p>
      )}
    </motion.section>
  );
}
