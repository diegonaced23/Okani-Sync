"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ProgressRing } from "@/components/ui/progress-ring";
import { EASE_OUT_EXPO, GLASS_SURFACE } from "@/lib/ios";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Side } from "./shared";

export interface Overview {
  currency: string;
  debtPending: number;
  debtOriginal: number;
  debtMonthly: number;
  debtOverdue: number;
  loanPending: number;
  loanOriginal: number;
  loanOverdue: number;
  missingRate: boolean;
}

/**
 * Resumen de la pestaña: el total pendiente y un anillo con cuánto va pagado
 * (lo que debes) o cobrado (lo que te deben), en la moneda preferida.
 */
export function OverviewCard({ side, data }: { side: Side; data: Overview | undefined }) {
  const reduce = useReducedMotion();
  if (!data) return <div className={cn("h-[152px] animate-pulse rounded-[28px]", GLASS_SURFACE)} />;

  const debo = side === "debo";
  const pending = debo ? data.debtPending : data.loanPending;
  const original = debo ? data.debtOriginal : data.loanOriginal;
  const overdue = debo ? data.debtOverdue : data.loanOverdue;
  const done = original > 0 ? (original - pending) / original : 0;
  const tone = debo ? "var(--os-magenta)" : "var(--os-lime)";

  return (
    <motion.section
      key={side}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
      className={cn("relative overflow-hidden rounded-[28px] p-5", GLASS_SURFACE)}
      aria-label={debo ? "Resumen de lo que debes" : "Resumen de lo que te deben"}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full opacity-[0.14] blur-3xl"
        style={{ background: tone }}
      />
      <div className="relative flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            {debo ? "Debes en total" : "Te deben en total"}
          </p>
          <p className="mt-1 truncate font-mono-num text-[30px] font-extrabold leading-none tracking-tight text-foreground tabular-nums">
            {formatCents(pending, data.currency)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {original > 0
              ? <>Llevas <strong className="text-foreground">{formatCents(original - pending, data.currency)}</strong> {debo ? "pagados" : "cobrados"}</>
              : debo ? "Sin deudas registradas" : "Sin préstamos registrados"}
          </p>
        </div>
        <ProgressRing value={done} color={tone} size={84} stroke={8} label={`${Math.round(done * 100)}% ${debo ? "pagado" : "cobrado"}`}>
          <span className="flex flex-col items-center leading-none">
            <span className="font-mono-num text-lg font-extrabold tabular-nums text-foreground">{Math.round(done * 100)}%</span>
            <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              {debo ? "pagado" : "cobrado"}
            </span>
          </span>
        </ProgressRing>
      </div>

      <div className="relative mt-4 flex flex-wrap gap-2">
        {debo && data.debtMonthly > 0 && (
          <Pill>Cuotas al mes · <strong className="text-foreground">{formatCents(data.debtMonthly, data.currency)}</strong></Pill>
        )}
        {overdue > 0 && (
          <Pill danger>{overdue} {debo ? (overdue === 1 ? "vencida" : "vencidas") : (overdue === 1 ? "vencido" : "vencidos")}</Pill>
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

function Pill({ children, danger }: { children: React.ReactNode; danger?: boolean }) {
  return (
    <span className={cn(
      "rounded-full px-2.5 py-1 text-xs font-semibold",
      danger
        ? "bg-[color-mix(in_oklch,var(--os-magenta)_15%,transparent)] text-[var(--os-magenta)]"
        : "bg-background/50 text-muted-foreground dark:bg-white/5",
    )}>
      {children}
    </span>
  );
}
