"use client";

import { useId, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { MoneyInput } from "@/components/ui/money-input";
import { EASE_OUT_EXPO, GLASS_SURFACE, haptic, tint } from "@/lib/ios";
import { calculateLoanAmortization, currentMonth, formatCents, formatMonth, fromCents, toCents } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * "¿Y si abono más cada mes?": compara el plan actual con uno con cuota más alta
 * y muestra cuántos meses e intereses se ahorran.
 */
export function PayoffSimulator({
  balance,
  monthlyRate,
  payment,
  currency,
}: {
  balance: number;
  monthlyRate: number;
  payment: number;
  currency: string;
}) {
  const id = useId();
  const reduce = useReducedMotion();
  const [extra, setExtra] = useState(String(fromCents(Math.round(payment * 0.25))));
  const extraCents = extra ? toCents(parseFloat(extra)) : 0;

  const base = useMemo(
    () => calculateLoanAmortization(balance, monthlyRate, payment, currentMonth()),
    [balance, monthlyRate, payment]
  );
  const boosted = useMemo(
    () => calculateLoanAmortization(balance, monthlyRate, payment + extraCents, currentMonth()),
    [balance, monthlyRate, payment, extraCents]
  );

  if (!base) {
    return (
      <div className={cn("rounded-[24px] px-5 py-6 text-center", GLASS_SURFACE)}>
        <p className="text-sm font-semibold text-foreground">La cuota actual no cubre los intereses</p>
        <p className="mt-1 text-xs text-muted-foreground">Con esa cuota el saldo no baja. Revisa la tasa o la cuota en «Editar».</p>
      </div>
    );
  }

  const monthsSaved = boosted ? base.totalPayments - boosted.totalPayments : 0;
  const interestSaved = boosted ? base.totalInterest - boosted.totalInterest : 0;
  const presets = [0.1, 0.25, 0.5, 1].map((f) => ({ label: `+${Math.round(f * 100)}%`, value: Math.round(payment * f) }));
  const maxMonths = base.totalPayments;

  return (
    <div className="space-y-4">
      <div className={cn("space-y-4 rounded-[24px] p-5", GLASS_SURFACE)}>
        <div>
          <label htmlFor={`${id}-extra`} className="text-sm font-semibold text-foreground">
            Si abonas extra cada mes
          </label>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-xl font-extrabold text-muted-foreground">+</span>
            <MoneyInput
              id={`${id}-extra`}
              value={extra}
              onChange={setExtra}
              placeholder="0"
              inputMode="decimal"
              className="h-auto border-none bg-transparent p-0 font-mono-num shadow-none focus-visible:ring-0"
              style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em" }}
            />
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">{currency}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {presets.map((p) => {
              const active = extraCents === p.value;
              return (
                <button
                  key={p.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => { haptic(); setExtra(String(fromCents(p.value))); }}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-semibold transition-[background-color,transform] active:scale-95",
                    active ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  {p.label} de la cuota
                </button>
              );
            })}
          </div>
        </div>

        {/* Barras: meses con la cuota actual vs con el extra */}
        <div className="space-y-2.5">
          <Bar
            label="Con tu cuota"
            detail={`${base.totalPayments} cuotas · ${formatMonth(base.payoffDate)}`}
            fraction={1}
            color="var(--muted-foreground)"
            reduce={reduce}
          />
          {boosted && (
            <Bar
              label={`Con ${formatCents(payment + extraCents, currency)}`}
              detail={`${boosted.totalPayments} cuotas · ${formatMonth(boosted.payoffDate)}`}
              fraction={boosted.totalPayments / maxMonths}
              color="var(--os-lime)"
              reduce={reduce}
            />
          )}
        </div>
      </div>

      {boosted && extraCents > 0 && (
        <motion.div
          key={`${monthsSaved}-${interestSaved}`}
          initial={reduce ? false : { opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
          className="grid grid-cols-2 gap-2"
        >
          <Saving value={monthsSaved > 0 ? `${monthsSaved} ${monthsSaved === 1 ? "mes" : "meses"}` : "—"} label="antes de terminar" />
          <Saving value={formatCents(Math.max(0, interestSaved), currency)} label="menos en intereses" />
        </motion.div>
      )}
      <p className="px-1 text-center text-xs text-muted-foreground">
        Estimación con la tasa y el saldo actuales; tu banco puede calcular distinto.
      </p>
    </div>
  );
}

function Bar({
  label,
  detail,
  fraction,
  color,
  reduce,
}: {
  label: string;
  detail: string;
  fraction: number;
  color: string;
  reduce: boolean | null;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="font-semibold text-foreground">{label}</span>
        <span className="text-muted-foreground">{detail}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full" style={{ background: tint(color, 16) }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${Math.max(fraction, 0.03) * 100}%` }}
          transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
        />
      </div>
    </div>
  );
}

function Saving({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[20px] bg-[color-mix(in_oklch,var(--os-lime)_14%,transparent)] px-4 py-3">
      <Sparkles className="mb-1 h-4 w-4 text-lime-text" aria-hidden="true" />
      <p className="font-mono-num text-lg font-extrabold tabular-nums text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
