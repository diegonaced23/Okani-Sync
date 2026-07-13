"use client";

import { memo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface MonthlySnapshotSectionProps {
  /** true mientras la query de tendencia está cargando */
  loading: boolean;
  monthIngresos: number;
  monthGastos: number;
  /** Porcentaje de gastos sobre ingresos del mes (0-100+) */
  spentPct: number;
  /** Nombre capitalizado del mes actual (ej. "Junio") */
  monthName: string;
  currency: string;
}

/**
 * Sección "Mes en curso": versión desktop (tarjeta + barra de progreso) y
 * versión mobile (dos mini-tarjetas lado a lado).
 */
export const MonthlySnapshotSection = memo(function MonthlySnapshotSection({
  loading,
  monthIngresos,
  monthGastos,
  spentPct,
  monthName,
  currency,
}: MonthlySnapshotSectionProps) {
  return (
    <section>
      {/* Desktop: tarjeta combinada con barra de progreso */}
      <div className="hidden md:flex flex-col rounded-xl border border-border bg-card p-5 h-full gap-4">
        {/* h2 para coherencia con los demás sections del dashboard que usan h2 */}
        <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground m-0">
          Mes en curso
        </h2>
        {loading ? (
          <div className="space-y-3 flex-1">
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-3 w-full rounded-full" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="w-2 h-2 rounded-full bg-lime shrink-0" />
                  <span className="text-[11px] text-muted-foreground font-semibold">Ingresos</span>
                </div>
                <p className="font-mono-num text-[22px] font-extrabold text-lime-text tracking-[-0.025em]">
                  {formatCents(monthIngresos, currency)}
                </p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="w-2 h-2 rounded-full bg-magenta shrink-0" />
                  <span className="text-[11px] text-muted-foreground font-semibold">Gastos</span>
                </div>
                <p className="font-mono-num text-[22px] font-extrabold text-magenta tracking-[-0.025em]">
                  {formatCents(monthGastos, currency)}
                </p>
              </div>
            </div>

            <div className="mt-auto space-y-1.5">
              <div
                role="progressbar"
                aria-valuenow={Math.min(100, spentPct)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Has gastado el ${spentPct}% de tus ingresos este mes`}
                className="h-2 w-full rounded-full overflow-hidden bg-muted"
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    spentPct >= 100 ? "bg-danger" : spentPct >= 80 ? "bg-warning" : "bg-lime"
                  )}
                  style={{ width: `${Math.min(100, spentPct)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Has gastado <strong>{spentPct}%</strong> de tus ingresos
              </p>
            </div>
          </>
        )}
      </div>

      {/* Mobile: dos tarjetas lado a lado (diseño original) */}
      <div className="md:hidden space-y-2.5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-bold text-foreground">Mes en curso · {monthName}</h2>
          <Link href="/transacciones" className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors py-2 -my-2 px-1">
            Detalles
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {loading ? (
            <>
              <Skeleton className="h-[72px] rounded-xl" />
              <Skeleton className="h-[72px] rounded-xl" />
            </>
          ) : (
            <>
              <div className="rounded-xl p-4 bg-[color-mix(in_oklch,var(--os-lime)_12%,var(--card))] border border-[color-mix(in_oklch,var(--os-lime)_28%,var(--border))]">
                <div className="flex items-center gap-2 mb-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                  <span className="w-2 h-2 rounded-full bg-lime shrink-0 shadow-[0_0_0_3px_color-mix(in_oklch,var(--os-lime)_28%,transparent)]" />
                  Ingresos
                </div>
                <p className="font-mono-num text-[20px] font-extrabold tracking-[-0.025em] text-lime-text">
                  {formatCents(monthIngresos, currency)}
                </p>
              </div>
              <div className="rounded-xl p-4 bg-[color-mix(in_oklch,var(--os-magenta)_12%,var(--card))] border border-[color-mix(in_oklch,var(--os-magenta)_28%,var(--border))]">
                <div className="flex items-center gap-2 mb-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                  <span className="w-2 h-2 rounded-full bg-magenta shrink-0 shadow-[0_0_0_3px_color-mix(in_oklch,var(--os-magenta)_25%,transparent)]" />
                  Gastos
                </div>
                <p className="font-mono-num text-[20px] font-extrabold tracking-[-0.025em] text-magenta">
                  {formatCents(monthGastos, currency)}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
});
