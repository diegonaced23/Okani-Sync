"use client";

import { formatCents } from "@/lib/money";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Eye, EyeOff, SlidersHorizontal, TrendingDown, TrendingUp } from "lucide-react";
import { memo } from "react";
import { useBalanceHidden } from "@/hooks/use-balance-hidden";

// Tinta de la tarjeta: gris-carbón casi neutro. Contraste ≈11:1 sobre el lima y
// ≈10:1 sobre el cyan del degradado, en modo claro y oscuro por igual.
const INK = "oklch(0.17 0.012 265)";
// Patrimonio negativo: la cifra sigue en INK y el estado lo anuncia un chip oscuro.
// Un rojo directo sobre el degradado verde vibra (complementarios) y se confunde
// con INK en daltonismo rojo-verde; sobre el fondo INK el coral sí se lee (≈6:1).
const CHIP_TEXT = "oklch(0.97 0 0)";
const CHIP_ICON = "oklch(0.72 0.17 25)";

interface BalanceCardProps {
  total: number | null | undefined;
  currency: string;
  missingRates?: string[];
  accountCount?: number;
  loading?: boolean;
  onManageAccounts?: () => void;
  // Desglose de patrimonio neto (2.1)
  totalAssets?: number;
  totalCardDebt?: number;
  totalDebt?: number;
  totalLoansReceivable?: number;
}

export const BalanceCard = memo(function BalanceCard({
  total,
  currency,
  missingRates = [],
  accountCount = 0,
  loading,
  onManageAccounts,
  totalAssets,
  totalCardDebt,
  totalDebt,
  totalLoansReceivable,
}: BalanceCardProps) {
  // Compartido con "Mes en curso": el ojo oculta los saldos de ambas tarjetas
  const [hidden, toggleHidden] = useBalanceHidden();

  if (loading || total === undefined) {
    return <Skeleton className="h-40 rounded-2xl" />;
  }

  const hasBreakdown = totalAssets !== undefined;
  const totalLiabilities = (totalCardDebt ?? 0) + (totalDebt ?? 0);
  const isNegative = (total ?? 0) < 0;

  return (
    <div
      className="relative overflow-hidden rounded-2xl px-[22px] pt-[22px] pb-5"
      style={{
        background: `
          radial-gradient(120% 100% at 0% 0%, var(--os-lime-2) 0%, transparent 55%),
          radial-gradient(120% 100% at 100% 100%, var(--os-cyan-2) 0%, transparent 60%),
          linear-gradient(135deg, var(--os-lime) 0%, var(--os-cyan) 100%)
        `,
        boxShadow: "var(--shadow-lg), inset 0 1px 0 oklch(1 0 0 / 0.45)",
        // Literal fijo, NO var(--foreground): el degradado es claro en ambos temas
        // (--os-lime L 0.85 / --os-cyan L 0.82 en dark), y --foreground se invierte
        // a casi blanco en .dark — quedaría blanco sobre lima.
        color: INK,
      }}
    >
      {/* Textura puntillada */}
      <span aria-hidden style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: "radial-gradient(circle at 1px 1px, currentColor 0.5px, transparent 1.5px)",
        backgroundSize: "14px 14px", opacity: 0.06, mixBlendMode: "multiply",
      }} />
      {/* Círculos decorativos */}
      <span aria-hidden style={{
        position: "absolute", top: -30, right: -20,
        width: 100, height: 100, borderRadius: "50%",
        border: "14px solid oklch(1 0 0 / 0.18)", pointerEvents: "none",
      }} />
      <span aria-hidden style={{
        position: "absolute", bottom: -40, right: 80,
        width: 60, height: 60, borderRadius: "50%",
        background: "oklch(1 0 0 / 0.15)", pointerEvents: "none",
      }} />

      {/* Contenido */}
      <div className="relative z-10">
        <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.10em] uppercase opacity-70 mb-1.5">
          <span>{hasBreakdown ? "Patrimonio neto" : "Patrimonio total"} · {accountCount} cuenta{accountCount !== 1 ? "s" : ""}</span>
          <span className="flex-1" />
          {onManageAccounts && (
            <button
              type="button"
              aria-label="Configurar cuentas del patrimonio"
              onClick={onManageAccounts}
              className="touch-hit flex items-center justify-center bg-transparent border-0 cursor-pointer text-inherit opacity-80 py-[15px] px-3 -my-[13px] rounded-xs"
            >
              <SlidersHorizontal size={14} />
            </button>
          )}
          <button
            type="button"
            aria-label={hidden ? "Mostrar saldo" : "Ocultar saldo"}
            onClick={toggleHidden}
            className="touch-hit flex items-center justify-center bg-transparent border-0 cursor-pointer text-inherit opacity-80 py-[15px] px-3 -my-[13px] rounded-xs"
          >
            {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>

        {/* Anuncia el cambio de visibilidad proactivamente — debe estar siempre montado para que aria-live funcione */}
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {hidden ? "Saldo oculto" : "Saldo visible"}
        </span>

        <p
          className="font-mono-num tracking-display text-[40px] font-extrabold leading-none mt-1.5 mb-2 whitespace-nowrap overflow-hidden"
          aria-label={hidden ? "Saldo oculto" : undefined}
        >
          {hidden ? <span aria-hidden="true">$ ••••••</span> : formatCents(total ?? 0, currency)}
        </p>

        {/* Oculto junto con el saldo: mostrarlo revelaría el signo del patrimonio */}
        {isNegative && !hidden && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 mb-2 text-[11px] font-semibold"
            style={{ background: INK, color: CHIP_TEXT }}
          >
            <TrendingDown size={12} aria-hidden="true" style={{ color: CHIP_ICON }} />
            En negativo
          </span>
        )}

        {/* Desglose activos / pasivos */}
        {hasBreakdown && !hidden && (
          // role="list" para semántica de lista; iconos decorativos con aria-hidden
          <div role="list" className="flex items-center gap-3 flex-wrap text-[11px] opacity-75">
            <span role="listitem" className="flex items-center gap-1">
              <TrendingUp size={11} aria-hidden="true" />
              <span>Activos: {formatCents(totalAssets!, currency)}</span>
            </span>
            {(totalLoansReceivable ?? 0) > 0 && (
              <span role="listitem" className="flex items-center gap-1">
                <TrendingUp size={11} aria-hidden="true" />
                <span>Prést. por cobrar: {formatCents(totalLoansReceivable!, currency)}</span>
              </span>
            )}
            {totalLiabilities > 0 && (
              <span role="listitem" className="flex items-center gap-1">
                <TrendingDown size={11} aria-hidden="true" />
                <span>Deudas: {formatCents(totalLiabilities, currency)}</span>
              </span>
            )}
          </div>
        )}

        {missingRates.length > 0 && (
          // 12px + opacidad 1 para legibilidad sobre el gradiente; title explica qué son y cuándo se actualizan
          <div
            className="flex items-center gap-1.5 mt-2 text-xs"
            title={`Tasas no disponibles para ${missingRates.join(", ")}. Se actualizan automáticamente cada día.`}
          >
            <AlertTriangle size={12} aria-hidden="true" />
            <span>Tasas no disponibles: {missingRates.join(", ")} — total puede ser inexacto</span>
          </div>
        )}
      </div>
    </div>
  );
});
