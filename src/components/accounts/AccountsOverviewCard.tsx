"use client";

import { motion, useReducedMotion } from "framer-motion";
import { EyeOff, TrendingDown } from "lucide-react";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ACCOUNT_TYPE_META } from "./accountTypes";
import { EASE_OUT_EXPO, GLASS_SURFACE, GROUP_LABELS, GROUP_ORDER, tint } from "./shared";

export interface AccountsOverview {
  currency: string;
  total: number;
  byType: Record<string, number>;
  count: number;
  excludedCount: number;
  negativeCount: number;
  missingRate: boolean;
}

/**
 * Cuánto tienes en total y dónde está repartido. El desglose por tipo va en una
 * sola barra: es más fácil ver de un vistazo que el ahorro es una rendija al lado
 * del día a día que comparando cuatro cifras.
 */
export function AccountsOverviewCard({ data }: { data: AccountsOverview | undefined }) {
  const reduce = useReducedMotion();
  if (!data) return <div className={cn("h-[168px] animate-pulse rounded-[28px]", GLASS_SURFACE)} />;

  const { currency, total } = data;
  const TONES: Record<string, string> = {
    bancaria: "var(--os-cyan)",
    ahorros: "var(--os-lime)",
    inversion: "var(--os-violet)",
    billetera: "var(--os-orange)",
  };

  // Solo los tipos con saldo positivo entran en la barra: un tipo en cero no ocupa
  // espacio y un tipo en negativo no se puede representar como parte de un total.
  const slices = GROUP_ORDER.map((type) => ({
    type,
    value: data.byType[type] ?? 0,
    tone: TONES[type],
  })).filter((s) => s.value > 0);
  const sliceTotal = slices.reduce((s, x) => s + x.value, 0);

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
      className={cn("relative overflow-hidden rounded-[28px] p-5", GLASS_SURFACE)}
      aria-label="Resumen de cuentas"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-[var(--os-cyan)] opacity-[0.14] blur-3xl"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-[var(--os-lime)] opacity-[0.12] blur-3xl"
      />

      <p className="relative text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        Tienes en total
      </p>
      <p className="relative mt-1 truncate font-mono-num text-[32px] font-extrabold leading-none tracking-tight text-foreground tabular-nums">
        {formatCents(total, currency)}
      </p>
      <p className="relative mt-1.5 text-xs text-muted-foreground">
        En {data.count} {data.count === 1 ? "cuenta propia" : "cuentas propias"}, convertido a {currency}
      </p>

      {/* Reparto por tipo en una sola barra */}
      {sliceTotal > 0 && (
        <div className="relative mt-4 space-y-2">
          <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
            {slices.map((s, i) => (
              <motion.span
                key={s.type}
                className="h-full rounded-full"
                style={{ background: s.tone }}
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${(s.value / sliceTotal) * 100}%` }}
                transition={{ duration: 0.75, ease: EASE_OUT_EXPO, delay: 0.12 + i * 0.06 }}
              />
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-3 gap-y-1">
            {slices.map((s) => {
              const Icon = ACCOUNT_TYPE_META[s.type].icon;
              return (
                <li key={s.type} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Icon className="h-3 w-3 shrink-0" style={{ color: s.tone }} aria-hidden="true" />
                  <span className="font-semibold text-foreground">{GROUP_LABELS[s.type]}</span>
                  <span className="font-mono-num tabular-nums">{formatCents(s.value, currency)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="relative mt-4 flex flex-wrap gap-2">
        {data.negativeCount > 0 && (
          <span
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{ background: tint("var(--os-magenta)", 15), color: "var(--os-magenta)" }}
          >
            <TrendingDown className="h-3 w-3" aria-hidden="true" />
            {data.negativeCount} en sobregiro
          </span>
        )}
        {data.excludedCount > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-background/50 px-2.5 py-1 text-xs font-semibold text-muted-foreground dark:bg-white/5">
            <EyeOff className="h-3 w-3" aria-hidden="true" />
            {data.excludedCount} fuera del total
          </span>
        )}
      </div>

      {data.missingRate && (
        <p className="relative mt-2 text-[11px] text-muted-foreground/80">
          Algunos saldos en otra moneda no se incluyen por falta de tasa de cambio.
        </p>
      )}
    </motion.section>
  );
}
