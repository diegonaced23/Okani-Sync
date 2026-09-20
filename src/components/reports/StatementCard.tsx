"use client";

import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Receipt } from "lucide-react";
import { AnimatedNumber } from "@/components/dashboard/month/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { useBalanceHidden } from "@/hooks/use-balance-hidden";
import { EASE_OUT_EXPO, GLASS_SURFACE, tint } from "@/lib/ios";
import { formatCents } from "@/lib/money";
import type { CurrencyTotals } from "@/lib/reports";
import { cn } from "@/lib/utils";

const MASK = "$ ••••••";

interface StatementCardProps {
  /** Totales por moneda, ya agrupados: un extracto no se convierte a la tasa de hoy */
  totals: CurrencyTotals[];
  /** Movimientos que entran en el extracto tras aplicar el filtro */
  count: number;
  /** El mes alcanzó el tope de la consulta y el conjunto está incompleto */
  truncated: boolean;
  /** Ese tope, para poder nombrarlo */
  cap: number;
  /** Con filtro activo, el «+» del contador no aplica: el recorte es del mes */
  filtered: boolean;
  monthLabel: string;
}

/**
 * Resumen del extracto. Reemplaza a las tres cifras que vivían dentro de la caja de
 * filtros, donde «Ingresos» y «Gastos» sumaban centavos de monedas distintas y los
 * etiquetaban con la moneda del perfil.
 */
export function StatementCard({
  totals,
  count,
  truncated,
  cap,
  filtered,
  monthLabel,
}: StatementCardProps) {
  const reduce = useReducedMotion();
  const [hidden] = useBalanceHidden();

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
      className={cn("relative overflow-hidden rounded-[28px] p-5", GLASS_SURFACE)}
      aria-label={`Resumen del extracto de ${monthLabel}`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-14 -top-16 h-48 w-48 rounded-full bg-[var(--os-cyan)] opacity-[0.12] blur-3xl"
      />

      <div className="relative flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{ background: tint("var(--os-cyan)", 16), color: "var(--os-cyan-text)" }}
          >
            <Receipt className="h-4 w-4" />
          </span>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            {monthLabel}
          </h2>
        </div>
        <p className="font-mono-num text-[15px] font-extrabold tabular-nums text-foreground">
          {/* El «+» solo vale sin filtro: bajo «Entradas» el recorte es del mes, no
              de las entradas, y las que hay son exactamente estas. */}
          {truncated && !filtered ? `${count}+` : count}
          <span className="ml-1 text-[11px] font-semibold text-muted-foreground">
            {count === 1 ? "movimiento" : "movimientos"}
          </span>
        </p>
      </div>

      {totals.length === 0 ? (
        <p className="relative mt-5 text-center text-sm text-muted-foreground">
          Sin entradas ni salidas en el período.
        </p>
      ) : (
        <ul className="relative mt-4 space-y-2.5">
          {totals.map((t, i) => (
            <motion.li
              key={t.currency}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: EASE_OUT_EXPO, delay: 0.08 + i * 0.05 }}
              className="rounded-[18px] bg-[color-mix(in_oklch,var(--muted)_45%,transparent)] p-3"
            >
              {/* La moneda se nombra por fila: es lo que hace que los dos importes
                  de al lado signifiquen algo sin convertirlos */}
              {totals.length > 1 && (
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {t.currency}
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Leg
                  label="Entradas"
                  amount={t.income}
                  currency={t.currency}
                  color="var(--os-lime)"
                  textColor="var(--os-lime-text)"
                  icon={ArrowDownLeft}
                  hidden={hidden}
                />
                <Leg
                  label="Salidas"
                  amount={t.expense}
                  currency={t.currency}
                  color="var(--os-magenta)"
                  textColor="var(--os-magenta)"
                  icon={ArrowUpRight}
                  hidden={hidden}
                />
              </div>
            </motion.li>
          ))}
        </ul>
      )}

      {truncated && (
        <p className="relative mt-4 flex items-start gap-1.5 border-t border-border/60 pt-3 text-[11px] text-warning-text">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          Este mes supera los {cap} movimientos. El extracto incluye los {cap} más
          recientes y los archivos se descargan marcados como parciales.
        </p>
      )}
    </motion.section>
  );
}

function Leg({
  label,
  amount,
  currency,
  color,
  textColor,
  icon: Icon,
  hidden,
}: {
  label: string;
  amount: number;
  currency: string;
  color: string;
  textColor: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  hidden: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span
          aria-hidden="true"
          className="flex h-4 w-4 items-center justify-center rounded-full"
          style={{ background: tint(color, 20), color }}
        >
          <Icon className="h-2.5 w-2.5" />
        </span>
        {label}
      </p>
      <p className="mt-1 truncate font-mono-num text-[17px] font-extrabold tabular-nums" style={{ color: textColor }}>
        {hidden ? (
          MASK
        ) : (
          <AnimatedNumber value={amount} format={(c) => formatCents(c, currency)} />
        )}
      </p>
    </div>
  );
}

/**
 * Skeleton con la altura de la tarjeta en su caso base: una sola moneda y sin aviso
 * de recorte. Medida sobre el propio componente —padding 40 + cabecera 32 + margen 16
 * + fila 64—, no a ojo. Con varias monedas o con el aviso la tarjeta crece, y ahí el
 * salto es inevitable: el esqueleto no puede saber cuántas monedas habrá.
 */
export function StatementCardSkeleton() {
  return <Skeleton className="h-[152px] rounded-[28px]" />;
}
