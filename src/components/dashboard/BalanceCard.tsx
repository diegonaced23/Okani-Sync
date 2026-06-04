"use client";

import { formatCents } from "@/lib/money";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Eye, EyeOff, SlidersHorizontal, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";

const STORAGE_KEY = "dashboard:balanceHidden";

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

export function BalanceCard({
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
  const [hidden, setHidden] = useState(() =>
    typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY) === "true"
  );

  const toggleHidden = () => {
    setHidden((h) => {
      const next = !h;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  if (loading || total === undefined) {
    return <Skeleton className="h-36 rounded-2xl" />;
  }

  const hasBreakdown = totalAssets !== undefined;
  const totalLiabilities = (totalCardDebt ?? 0) + (totalDebt ?? 0);
  const isNegative = (total ?? 0) < 0;

  return (
    <div
      className="relative overflow-hidden"
      style={{
        borderRadius: 38,
        padding: "22px 22px 20px",
        background: `
          radial-gradient(120% 100% at 0% 0%, var(--os-lime-2) 0%, transparent 55%),
          radial-gradient(120% 100% at 100% 100%, var(--os-cyan-2) 0%, transparent 60%),
          linear-gradient(135deg, var(--os-lime) 0%, var(--os-cyan) 100%)
        `,
        boxShadow: "var(--shadow-lg), inset 0 1px 0 oklch(1 0 0 / 0.45)",
        color: "oklch(0.18 0.04 190)",
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
        <div className="flex items-center gap-2" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", opacity: 0.7, marginBottom: 6 }}>
          <span>{hasBreakdown ? "Patrimonio neto" : "Patrimonio total"} · {accountCount} cuenta{accountCount !== 1 ? "s" : ""}</span>
          <span style={{ flex: 1 }} />
          {onManageAccounts && (
            <button
              type="button"
              aria-label="Configurar cuentas del patrimonio"
              onClick={onManageAccounts}
              style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", opacity: 0.8, padding: 2 }}
            >
              <SlidersHorizontal size={14} />
            </button>
          )}
          <button
            type="button"
            aria-label={hidden ? "Mostrar saldo" : "Ocultar saldo"}
            onClick={toggleHidden}
            style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", opacity: 0.8, padding: 2 }}
          >
            {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>

        <p
          className="font-mono-num tracking-display"
          aria-label={hidden ? "Saldo oculto" : undefined}
          style={{
            fontSize: 40, fontWeight: 800, lineHeight: 1,
            color: isNegative ? "oklch(0.35 0.15 27)" : "oklch(0.18 0.04 190)",
            margin: "6px 0 8px",
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          {hidden ? <span aria-hidden="true">$ ••••••</span> : formatCents(total ?? 0, currency)}
        </p>

        {/* Desglose activos / pasivos */}
        {hasBreakdown && !hidden && (
          <div className="flex items-center gap-3 flex-wrap" style={{ fontSize: 11, opacity: 0.75 }}>
            <span className="flex items-center gap-1">
              <TrendingUp size={11} />
              <span>Activos: {formatCents(totalAssets!, currency)}</span>
            </span>
            {(totalLoansReceivable ?? 0) > 0 && (
              <span className="flex items-center gap-1">
                <TrendingUp size={11} />
                <span>Prést. por cobrar: {formatCents(totalLoansReceivable!, currency)}</span>
              </span>
            )}
            {totalLiabilities > 0 && (
              <span className="flex items-center gap-1">
                <TrendingDown size={11} />
                <span>Deudas: {formatCents(totalLiabilities, currency)}</span>
              </span>
            )}
          </div>
        )}

        {missingRates.length > 0 && (
          <div className="flex items-center gap-1.5 mt-2" style={{ fontSize: 11, opacity: 0.8 }}>
            <AlertTriangle size={12} />
            <span>Sin tasa para: {missingRates.join(", ")}</span>
          </div>
        )}
      </div>
    </div>
  );
}
