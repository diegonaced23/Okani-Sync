"use client";

import { motion, useReducedMotion } from "framer-motion";
import { CreditCard, Pencil, Archive } from "lucide-react";
import { ProgressRing } from "@/components/ui/progress-ring";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { CardFace } from "./CardFace";
import {
  EASE_OUT_EXPO,
  GLASS_SURFACE,
  haptic,
  tint,
  usageOf,
  usageTextTone,
  usageTone,
  type Card,
} from "./shared";

/**
 * Cabecera del detalle: el plástico, el uso del cupo y qué toca pagar.
 *
 * El bloque de pago cuenta y cobra el mismo bucket. Antes mostraba el número de
 * cuotas del ciclo EN CURSO junto al monto del ciclo ya FACTURADO —dos cosas
 * distintas presentadas como una sola cifra—, así que el número no cuadraba con
 * el importe.
 */
export function CardHero({
  card,
  nowMs,
  /** Fechas del ciclo tal como las calcula el backend */
  paymentTs,
  billedCount,
  billedAmount,
  currentCycleCount,
  isPaymentOverdue,
  onPay,
  onEdit,
  onArchive,
}: {
  card: Card;
  nowMs: number;
  paymentTs: number;
  /** Cuotas del ciclo cerrado: son las que suman el pago mínimo */
  billedCount: number;
  billedAmount: number;
  /** Cuotas que caen en el ciclo que aún no cierra */
  currentCycleCount: number;
  isPaymentOverdue: boolean;
  onPay: () => void;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const reduce = useReducedMotion();
  const usage = usageOf(card);
  const tone = usageTone(usage);
  const owes = card.currentBalance > 0;
  // La fecha viene del ciclo del backend para no contradecir a las pestañas, que
  // usan ese mismo dato. `dueOf` se queda para el listado, que no tiene el ciclo.
  const days = Math.max(0, Math.round((startOfDay(paymentTs) - startOfDay(nowMs)) / 86_400_000));
  const due = owes
    ? {
        urgent: days <= 5,
        text:
          days === 0
            ? "Paga hoy"
            : days === 1
              ? "Paga mañana"
              : days <= 5
                ? `Paga en ${days} días`
                : `Paga el ${new Date(paymentTs).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}`,
      }
    : null;

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
      className={cn("overflow-hidden rounded-[28px]", GLASS_SURFACE)}
      aria-label={`Resumen de ${card.name}`}
    >
      <CardFace
        brand={card.brand ?? "otro"}
        lastFourDigits={card.lastFourDigits}
        name={card.name}
        color={card.color}
        trailing={
          <span className="font-mono-num shrink-0 font-bold">
            Cupo {formatCents(card.creditLimit, card.currency)}
          </span>
        }
      />

      <div className="space-y-4 p-5">
        {/* El nombre ya se ve en el plástico: aquí solo encabeza la página */}
        <h1 className="sr-only">{card.name}</h1>

        {/* Deuda y uso del cupo */}
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              {owes ? "Debes en esta tarjeta" : "Sin deuda"}
            </p>
            <p className="mt-1 truncate font-mono-num text-[30px] font-extrabold leading-none tracking-tight text-foreground tabular-nums">
              {formatCents(card.currentBalance, card.currency)}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Disponible{" "}
              <strong className="font-mono-num tabular-nums text-foreground">
                {formatCents(card.availableCredit, card.currency)}
              </strong>
              {card.interestRate ? ` · ${(card.interestRate * 100).toFixed(1)}% m.v.` : ""}
            </p>
          </div>

          <ProgressRing
            value={Math.min(usage, 1)}
            color={tone}
            size={80}
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

        {/* Qué toca pagar */}
        {owes && (
          <div
            className="rounded-[20px] px-4 py-3"
            style={{
              background: isPaymentOverdue
                ? tint("var(--os-magenta)", 10)
                : tint(due?.urgent ? "var(--os-orange)" : "var(--os-cyan)", 10),
            }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <p
                className="text-[11px] font-bold uppercase tracking-[0.08em]"
                style={{
                  color: isPaymentOverdue
                    ? "var(--os-magenta)"
                    : due?.urgent
                      ? "var(--os-orange-text)"
                      : "var(--os-cyan-text)",
                }}
              >
                Pago mínimo
              </p>
              {due && (
                <span className="text-[11px] font-semibold text-muted-foreground">
                  {isPaymentOverdue ? "Ya venció" : due.text}
                </span>
              )}
            </div>

            <p className="mt-1 font-mono-num text-[22px] font-extrabold leading-none tabular-nums text-foreground">
              {formatCents(billedAmount, card.currency)}
            </p>

            <p className="mt-1.5 text-xs text-muted-foreground">
              {billedCount > 0
                ? `${billedCount} ${billedCount === 1 ? "cuota" : "cuotas"} del ciclo anterior`
                : currentCycleCount > 0
                  ? "Nada facturado todavía del ciclo anterior"
                  : "Sin cuotas programadas: la deuda no viene de compras a cuotas"}
              {currentCycleCount > 0 &&
                ` · ${currentCycleCount} ${currentCycleCount === 1 ? "cuota" : "cuotas"} en el ciclo en curso`}
            </p>

            <button
              type="button"
              onClick={() => { haptic(); onPay(); }}
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-[14px] bg-gradient-to-r from-emerald-400 to-teal-500 text-[15px] font-bold text-white shadow-[0_10px_24px_-10px_rgb(16_185_129/0.8)] transition-transform active:scale-[0.98]"
            >
              <CreditCard className="h-4 w-4" aria-hidden="true" />
              Pagar tarjeta
            </button>
          </div>
        )}

        {!owes && (
          <p
            className="rounded-[20px] px-4 py-3 text-center text-sm font-semibold"
            style={{ background: tint("var(--os-lime)", 12), color: usageTextTone(0) }}
          >
            Esta tarjeta está al día 🎉
          </p>
        )}

        {/* La nota de la tarjeta se guardaba y no se mostraba en ninguna pantalla */}
        {card.notes && (
          <p className="rounded-[16px] bg-background/50 px-3 py-2.5 text-sm text-foreground dark:bg-white/5">
            {card.notes}
          </p>
        )}

        <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
          <Action icon={Pencil} label="Editar" onAction={onEdit} />
          <Action icon={Archive} label="Archivar" onAction={onArchive} />
        </div>
      </div>
    </motion.section>
  );
}

function Action({
  icon: Icon,
  label,
  onAction,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  label: string;
  onAction: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => { haptic(); onAction(); }}
      className="flex items-center gap-1.5 rounded-full bg-background/60 px-3 py-2 text-[13px] font-semibold text-foreground transition-[background-color,transform] hover:bg-background active:scale-95 dark:bg-white/8 dark:hover:bg-white/12"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}

/** Medianoche local del timestamp: los días se cuentan por fecha, no por horas. */
function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
