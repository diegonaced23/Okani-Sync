"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { formatCents } from "@/lib/money";
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
export function MonthlySnapshotSection({
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
        <h2 style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)", margin: 0 }}>
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
                  <span style={{ width: 8, height: 8, borderRadius: 9999, background: "var(--os-lime)", flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: "var(--muted-foreground)", fontWeight: 600 }}>Ingresos</span>
                </div>
                <p className="font-mono-num" style={{ fontSize: 22, fontWeight: 800, color: "var(--os-lime-text)", letterSpacing: "-0.025em" }}>
                  {formatCents(monthIngresos, currency)}
                </p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span style={{ width: 8, height: 8, borderRadius: 9999, background: "var(--os-magenta)", flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: "var(--muted-foreground)", fontWeight: 600 }}>Gastos</span>
                </div>
                <p className="font-mono-num" style={{ fontSize: 22, fontWeight: 800, color: "var(--os-magenta)", letterSpacing: "-0.025em" }}>
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
                className="h-2 w-full rounded-full overflow-hidden"
                style={{ background: "var(--muted)" }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, spentPct)}%`,
                    background: spentPct >= 100 ? "var(--danger)" : spentPct >= 80 ? "var(--warning)" : "var(--os-lime)",
                  }}
                />
              </div>
              <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
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
              <div className="rounded-xl p-4" style={{ background: "color-mix(in oklch, var(--os-lime) 12%, var(--card))", border: "1px solid color-mix(in oklch, var(--os-lime) 28%, var(--border))" }}>
                <div className="flex items-center gap-2 mb-1.5" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted-foreground)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 9999, background: "var(--os-lime)", boxShadow: "0 0 0 3px color-mix(in oklch, var(--os-lime) 28%, transparent)", flexShrink: 0 }} />
                  Ingresos
                </div>
                <p className="font-mono-num" style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.025em", color: "var(--os-lime-text)" }}>
                  {formatCents(monthIngresos, currency)}
                </p>
              </div>
              <div className="rounded-xl p-4" style={{ background: "color-mix(in oklch, var(--os-magenta) 12%, var(--card))", border: "1px solid color-mix(in oklch, var(--os-magenta) 28%, var(--border))" }}>
                <div className="flex items-center gap-2 mb-1.5" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted-foreground)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 9999, background: "var(--os-magenta)", boxShadow: "0 0 0 3px color-mix(in oklch, var(--os-magenta) 25%, transparent)", flexShrink: 0 }} />
                  Gastos
                </div>
                <p className="font-mono-num" style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.025em", color: "var(--os-magenta)" }}>
                  {formatCents(monthGastos, currency)}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
