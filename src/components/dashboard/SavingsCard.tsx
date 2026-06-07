"use client";

import { PiggyBank, ArrowRight } from "lucide-react";
import { formatCents } from "@/lib/money";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";

// Unión discriminada: { loading: true } no requiere datos; la rama de datos no acepta loading=true
type SavingsCardProps =
  | { loading: true }
  | {
      loading?: false;
      totalAhorrado: number;
      transferenciasAhorro: number;
      gastosMetaVinculada: number;
      tasaAhorro: number | null;
      totalIngresos: number;
      currency: string;
      cuentasAhorro: { id: string; name: string; balance: number; color: string }[];
    };

export function SavingsCard(props: SavingsCardProps) {
  if (props.loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-3 w-full rounded-full" />
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
        </div>
      </div>
    );
  }

  // Después del guard de loading, TypeScript estrecha props a la rama de datos
  const { totalAhorrado, transferenciasAhorro, gastosMetaVinculada, tasaAhorro, totalIngresos, currency, cuentasAhorro } = props;
  const hasSavings = totalAhorrado > 0;
  const tasa = tasaAhorro !== null ? Math.round(tasaAhorro) : null;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="flex items-center justify-center rounded-xl"
            style={{ width: 34, height: 34, background: "color-mix(in oklch, var(--os-cyan) 14%, var(--surface-2))" }}
          >
            <PiggyBank className="h-[18px] w-[18px]" style={{ color: "var(--os-cyan)" }} />
          </span>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)" }}>
            Ahorro este mes
          </p>
        </div>
        <Link
          href="/presupuestos"
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors py-2 -my-2 px-1"
        >
          Ver presupuestos <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* ── Monto total ─────────────────────────────────────────────────────── */}
      <div>
        <p
          className="font-mono-num"
          style={{
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: "-0.03em",
            color: hasSavings ? "var(--os-cyan)" : "var(--muted-foreground)",
          }}
        >
          {formatCents(totalAhorrado, currency)}
        </p>
        {tasa !== null && totalIngresos > 0 && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {tasa}% de los ingresos del mes
          </p>
        )}
      </div>

      {/* ── Barra de progreso de tasa ────────────────────────────────────────── */}
      {totalIngresos > 0 && (
        <div
          role="progressbar"
          aria-valuenow={Math.min(100, tasa ?? 0)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Tasa de ahorro: ${tasa ?? 0}%`}
          className="h-1.5 w-full rounded-full overflow-hidden"
          style={{ background: "var(--muted)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(100, tasa ?? 0)}%`,
              background: "linear-gradient(90deg, var(--os-cyan), var(--os-lime))",
            }}
          />
        </div>
      )}

      {/* ── Desglose ────────────────────────────────────────────────────────── */}
      {hasSavings && (
        <div className="grid grid-cols-2 gap-2">
          {transferenciasAhorro > 0 && (
            <div
              className="rounded-lg p-3 space-y-0.5"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
            >
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                Cuentas ahorro
              </p>
              <p className="font-mono-num text-sm font-bold text-foreground">
                {formatCents(transferenciasAhorro, currency)}
              </p>
            </div>
          )}
          {gastosMetaVinculada > 0 && (
            <div
              className="rounded-lg p-3 space-y-0.5"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
            >
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                Metas (efectivo)
              </p>
              <p className="font-mono-num text-sm font-bold text-foreground">
                {formatCents(gastosMetaVinculada, currency)}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Cuentas de ahorro ───────────────────────────────────────────────── */}
      {cuentasAhorro.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Saldos en cuentas de ahorro
          </p>
          <div className="space-y-1.5">
            {cuentasAhorro.slice(0, 3).map((cuenta) => (
              <div key={cuenta.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="flex-shrink-0 rounded-full"
                    style={{ width: 8, height: 8, background: cuenta.color }}
                  />
                  <span className="text-xs text-foreground truncate">{cuenta.name}</span>
                </div>
                <span className="font-mono-num text-xs font-semibold text-foreground ml-3 shrink-0">
                  {formatCents(cuenta.balance, currency)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Estado vacío ────────────────────────────────────────────────────── */}
      {!hasSavings && cuentasAhorro.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Transfiere a una cuenta de ahorro o crea una meta para empezar a registrar tu ahorro.
        </p>
      )}
    </div>
  );
}
