"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ProgressRing } from "@/components/ui/progress-ring";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { EASE_OUT_EXPO, GLASS_SURFACE, tint, usageTextTone, usageTone } from "./shared";

export interface CardsOverview {
  currency: string;
  debt: number;
  limit: number;
  available: number;
  count: number;
  overUsedCount: number;
  missingRate: boolean;
}

/**
 * Deuda total de las tarjetas y qué parte del cupo se está usando. El total viene
 * ya convertido del backend: antes se sumaban tarjetas de monedas distintas y el
 * resultado se etiquetaba como pesos.
 */
export function CardsOverviewCard({ data }: { data: CardsOverview | undefined }) {
  const reduce = useReducedMotion();
  if (!data) return <div className={cn("h-[152px] animate-pulse rounded-[28px]", GLASS_SURFACE)} />;

  const { currency, debt, limit, available } = data;
  const usage = limit > 0 ? debt / limit : 0;
  const tone = usageTone(usage);

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
      className={cn("relative overflow-hidden rounded-[28px] p-5", GLASS_SURFACE)}
      aria-label="Resumen de tarjetas"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full opacity-[0.14] blur-3xl"
        style={{ background: tone }}
      />

      <div className="relative flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Debes en tarjetas
          </p>
          <p className="mt-1 truncate font-mono-num text-[30px] font-extrabold leading-none tracking-tight text-foreground tabular-nums">
            {formatCents(debt, currency)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {limit > 0
              ? <>Te queda <strong className="text-foreground">{formatCents(available, currency)}</strong> de cupo</>
              : "Sin cupo registrado"}
          </p>
        </div>

        <ProgressRing
          value={Math.min(usage, 1)}
          color={tone}
          size={84}
          stroke={8}
          label={`${Math.round(usage * 100)}% del cupo usado`}
        >
          <span className="flex flex-col items-center leading-none">
            <span className="font-mono-num text-lg font-extrabold tabular-nums text-foreground">
              {Math.round(usage * 100)}%
            </span>
            <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              del cupo
            </span>
          </span>
        </ProgressRing>
      </div>

      <div className="relative mt-4 flex flex-wrap gap-2">
        <span
          className="rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{ background: tint(tone, 15), color: usageTextTone(usage) }}
        >
          {data.count} {data.count === 1 ? "tarjeta" : "tarjetas"}
        </span>
        {data.overUsedCount > 0 && (
          <span
            className="rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{ background: tint("var(--os-magenta)", 15), color: "var(--os-magenta)" }}
          >
            {data.overUsedCount} sobre el 80% del cupo
          </span>
        )}
        {limit > 0 && (
          <span className="rounded-full bg-background/50 px-2.5 py-1 text-xs font-semibold text-muted-foreground dark:bg-white/5">
            Cupo total {formatCents(limit, currency)}
          </span>
        )}
      </div>

      {data.missingRate && (
        <p className="relative mt-2 text-[11px] text-muted-foreground/80">
          Algunas tarjetas en otra moneda no se incluyen por falta de tasa de cambio.
        </p>
      )}
    </motion.section>
  );
}
