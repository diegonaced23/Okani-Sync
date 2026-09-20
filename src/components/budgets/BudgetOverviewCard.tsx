"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ProgressRing } from "@/components/ui/progress-ring";
import { EASE_OUT_EXPO, GLASS_SURFACE, tint } from "@/lib/ios";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { paceOf } from "./shared";

export interface BudgetOverview {
  currency: string;
  budgeted: number;
  spent: number;
  overCount: number;
  warnCount: number;
  missingRate: boolean;
}

/**
 * Resumen del mes: cuánto se ha gastado del total presupuestado y, sobre todo, si
 * ese gasto va al ritmo del mes. La marca en la barra es el día en que vamos: si
 * el relleno la pasa, se está gastando más rápido de lo que avanza el mes.
 */
export function BudgetOverviewCard({
  data,
  month,
  nowMs,
}: {
  data: BudgetOverview | undefined;
  month: string;
  nowMs: number;
}) {
  const reduce = useReducedMotion();
  if (!data) return <div className={cn("h-[196px] animate-pulse rounded-[28px]", GLASS_SURFACE)} />;

  const { currency, budgeted, spent } = data;
  const ratio = budgeted > 0 ? spent / budgeted : 0;
  const over = ratio > 1;
  const pace = paceOf(month, spent, budgeted, nowMs);
  const tone = over ? "var(--os-magenta)" : pace.closed || pace.onTrack ? "var(--os-lime)" : "var(--os-orange)";
  const available = Math.max(0, budgeted - spent);

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
      className={cn("relative overflow-hidden rounded-[28px] p-5", GLASS_SURFACE)}
      aria-label="Resumen del mes"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full opacity-[0.14] blur-3xl"
        style={{ background: tone }}
      />

      <div className="relative flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Gastado este mes
          </p>
          <p className="mt-1 truncate font-mono-num text-[30px] font-extrabold leading-none tracking-tight text-foreground tabular-nums">
            {formatCents(spent, currency)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {over
              ? <>Te pasaste <strong style={{ color: "var(--os-magenta)" }}>{formatCents(spent - budgeted, currency)}</strong> del total</>
              : <>Te quedan <strong className="text-foreground">{formatCents(available, currency)}</strong> de {formatCents(budgeted, currency)}</>}
          </p>
        </div>

        <ProgressRing
          value={Math.min(ratio, 1)}
          color={tone}
          size={84}
          stroke={8}
          label={`${Math.round(ratio * 100)}% del presupuesto gastado`}
        >
          <span className="flex flex-col items-center leading-none">
            <span className="font-mono-num text-lg font-extrabold tabular-nums text-foreground">
              {Math.round(ratio * 100)}%
            </span>
            <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              usado
            </span>
          </span>
        </ProgressRing>
      </div>

      {/* Ritmo: relleno del gasto contra la marca del día del mes */}
      {budgeted > 0 && (
        <div className="relative mt-4 space-y-1.5">
          <div className="relative h-2.5 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full rounded-full"
              style={{ background: tone }}
              initial={reduce ? false : { width: 0 }}
              animate={{ width: `${Math.min(ratio, 1) * 100}%` }}
              transition={{ duration: 0.85, ease: EASE_OUT_EXPO, delay: 0.12 }}
            />
            {!pace.closed && pace.elapsed > 0 && pace.elapsed < 1 && (
              <span
                aria-hidden="true"
                className="absolute top-0 h-full w-[2px] rounded-full bg-foreground/45"
                style={{ left: `calc(${pace.elapsed * 100}% - 1px)` }}
              />
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {pace.closed
              ? <>Mes cerrado · {Math.round(ratio * 100)}% del presupuesto</>
              // Los primeros días un solo gasto multiplicado por 30 da una cifra
              // alarmista que no informa de nada: mejor no proyectar todavía.
              : pace.day < 3
                ? <>Día {pace.day} de {pace.days} · es muy pronto para proyectar el mes</>
              : pace.onTrack
                ? <>Día {pace.day} de {pace.days} · al ritmo actual cerrarías en <strong className="text-foreground">{formatCents(pace.projected, currency)}</strong></>
                : <>Día {pace.day} de {pace.days} · a este ritmo cerrarías en <strong style={{ color: over ? "var(--os-magenta)" : "var(--os-orange-text)" }}>{formatCents(pace.projected, currency)}</strong></>}
          </p>
        </div>
      )}

      <div className="relative mt-4 flex flex-wrap gap-2">
        {data.overCount > 0 && (
          <Pill tone="var(--os-magenta)">
            {data.overCount} excedido{data.overCount > 1 ? "s" : ""}
          </Pill>
        )}
        {data.warnCount > 0 && (
          <Pill tone="var(--os-orange)" text="var(--os-orange-text)">
            {data.warnCount} en riesgo
          </Pill>
        )}
        {data.overCount === 0 && data.warnCount === 0 && (
          <Pill tone="var(--os-lime)" text="var(--os-lime-text)">Todo bajo control</Pill>
        )}
        {!pace.closed && pace.perDayLeft > 0 && (
          <Pill>
            Puedes gastar <strong className="text-foreground">{formatCents(pace.perDayLeft, currency)}</strong>/día
          </Pill>
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

function Pill({
  children,
  tone,
  text,
}: {
  children: React.ReactNode;
  tone?: string;
  text?: string;
}) {
  if (!tone) {
    return (
      <span className="rounded-full bg-background/50 px-2.5 py-1 text-xs font-semibold text-muted-foreground dark:bg-white/5">
        {children}
      </span>
    );
  }
  return (
    <span
      className="rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ background: tint(tone, 15), color: text ?? tone }}
    >
      {children}
    </span>
  );
}
