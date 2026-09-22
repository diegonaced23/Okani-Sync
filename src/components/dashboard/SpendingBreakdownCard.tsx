"use client";

import { memo, useId, useState } from "react";
import Link from "next/link";
import { ArrowRight, CreditCard } from "lucide-react";
import { useBalanceHidden } from "@/hooks/use-balance-hidden";
import { GLASS_SURFACE } from "@/lib/ios";
import { formatCents } from "@/lib/money";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Breakdown = "categoria" | "fuente";

interface Row {
  name: string;
  amount: number;
  color: string;
}

interface SpendingBreakdownCardProps {
  /** Gastos por categoría — el color viene de la propia categoría */
  byCategory: { name: string; amount: number; color: string }[] | undefined;
  /** Gastos por cuenta/tarjeta — sin color propio (los de cuenta son gradientes CSS) */
  bySource: { name: string; amount: number }[] | undefined;
  currency: string;
  monthName: string;
  /** Compras con tarjeta del mes que aún no cuentan como gasto (se facturan en el corte) */
  pendingCard?: { amount: number; count: number; currency: string };
}

// Paleta fija para las barras de "fuente": los colores de cuenta son gradientes
// CSS y no se pueden usar como color plano de barra.
const SOURCE_COLORS = [
  "var(--os-lime)",
  "var(--os-cyan)",
  "var(--os-orange)",
  "var(--os-magenta)",
  "var(--os-violet)",
  "oklch(0.72 0.16 180)", // esmeralda — sin token propio aún
];

const TABS: { key: Breakdown; label: string; srCaption: string }[] = [
  { key: "categoria", label: "Categoría", srCaption: "Gastos por categoría este mes" },
  { key: "fuente",    label: "Fuente",    srCaption: "Gastos por cuenta y tarjeta este mes" },
];

function truncate(s: string, max = 22): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/** Lista de barras de un desglose. Asume `rows` ya filtrado y ordenado desc. */
function BreakdownBars({
  rows,
  total,
  currency,
  caption,
  hidden,
}: {
  rows: Row[];
  total: number;
  currency: string;
  caption: string;
  /** Saldos ocultos: se enmascaran los importes, no los porcentajes */
  hidden?: boolean;
}) {
  const money = (cents: number) => (hidden ? "$ ••••••" : formatCents(cents, currency));
  const max = rows[0].amount;

  return (
    <>
      <div role="img" aria-label={caption} className="space-y-3">
        {rows.map((d) => {
          const pct = max > 0 ? (d.amount / max) * 100 : 0;
          const sharePct = total > 0 ? Math.round((d.amount / total) * 100) : 0;

          return (
            <div key={d.name} className="space-y-1">
              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ background: d.color }}
                    aria-hidden="true"
                  />
                  <span className="text-xs font-medium text-foreground truncate">
                    {truncate(d.name)}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs tabular-nums font-semibold text-foreground">
                    {money(d.amount)}
                  </span>
                  <span
                    className="text-[10px] tabular-nums rounded-full px-1.5 py-0.5 font-medium"
                    style={{
                      background: `color-mix(in oklch, ${d.color} 18%, transparent)`,
                      color: d.color,
                    }}
                  >
                    {sharePct}%
                  </span>
                </div>
              </div>

              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ background: "var(--surface-2, var(--muted))" }}
              >
                <div
                  className="h-full rounded-full bar-fill"
                  style={{
                    width: `${pct}%`,
                    background: d.color,
                    minWidth: pct > 0 ? "6px" : "0",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabla accesible para lectores de pantalla */}
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Concepto</th>
            <th scope="col">Monto</th>
            <th scope="col">Porcentaje</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.name}>
              <td>{d.name}</td>
              <td>{money(d.amount)}</td>
              <td>{total > 0 ? Math.round((d.amount / total) * 100) : 0}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/**
 * Desglose del gasto del mes con dos vistas del mismo total: por categoría
 * (en qué se fue) y por fuente (de qué cuenta o tarjeta salió). Antes eran dos
 * tarjetas separadas; en una sola con pestañas ocupan un bloque en vez de dos.
 */
export const SpendingBreakdownCard = memo(function SpendingBreakdownCard({
  byCategory,
  bySource,
  currency,
  monthName,
  pendingCard,
}: SpendingBreakdownCardProps) {
  const [tab, setTab] = useState<Breakdown>("categoria");
  const baseId = useId();
  const [balanceHidden] = useBalanceHidden();

  // El skeleton cubre ambas queries: cambiar de pestaña no debe revelar un hueco.
  if (byCategory === undefined || bySource === undefined) {
    return <Skeleton className="h-72 rounded-[22px]" />;
  }

  const categoryRows: Row[] = [...byCategory]
    .filter((d) => d.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const sourceRows: Row[] = bySource
    .filter((d) => d.amount > 0)
    .map((d, i) => ({ ...d, color: SOURCE_COLORS[i % SOURCE_COLORS.length] }));

  const rows = tab === "categoria" ? categoryRows : sourceRows;
  const total = rows.reduce((s, d) => s + d.amount, 0);
  // El ojo de la tarjeta de patrimonio también manda aquí: antes este total y cada
  // importe del desglose seguían visibles con los saldos ocultos.
  const money = (cents: number) => (balanceHidden ? "$ ••••••" : formatCents(cents, currency));
  const activeTab = TABS.find((t) => t.key === tab)!;

  // Las compras a cuotas cuentan como gasto al facturarse en el corte: sin esta
  // línea, una compra de hoy no aparecería en ninguna parte hasta el mes siguiente.
  // Va aparte, y no sumada al total, para no contarla dos veces cuando se facture.
  const pendingLine =
    pendingCard && pendingCard.amount > 0 && pendingCard.currency === currency ? (
      <div className="mt-3 flex items-start gap-2.5 rounded-[14px] px-3 py-2.5" style={{ background: "var(--surface-2, var(--muted))" }}>
        <CreditCard className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold text-foreground">Compras con tarjeta por facturar</span>
            <span className="font-mono-num text-xs font-bold tabular-nums text-foreground">{money(pendingCard.amount)}</span>
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {pendingCard.count === 1 ? "1 compra de" : `${pendingCard.count} compras de`} {monthName}. Cada cuota cuenta como
            gasto cuando la tarjeta la factura en su corte.
          </p>
        </div>
      </div>
    ) : null;

  return (
    <div className={cn("rounded-[22px] p-4", GLASS_SURFACE)}>
      {/* ── Cabecera + pestañas ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Gastos de {monthName}
        </h3>
        <div
          role="tablist"
          aria-label="Desglose de gastos"
          className="flex items-center gap-0.5 rounded-lg p-0.5 shrink-0"
          style={{ background: "var(--surface-2, var(--muted))" }}
        >
          {TABS.map((t) => {
            const selected = t.key === tab;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`${baseId}-tab-${t.key}`}
                aria-selected={selected}
                aria-controls={`${baseId}-panel-${t.key}`}
                // Solo la pestaña activa es tabbable; las flechas mueven entre pestañas
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(t.key)}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                  e.preventDefault();
                  const i = TABS.findIndex((x) => x.key === tab);
                  const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
                  setTab(next.key);
                  document.getElementById(`${baseId}-tab-${next.key}`)?.focus();
                }}
                className={cn(
                  "touch-hit rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Panel ───────────────────────────────────────────────────────────── */}
      <div
        role="tabpanel"
        id={`${baseId}-panel-${tab}`}
        aria-labelledby={`${baseId}-tab-${tab}`}
        // key fuerza el remontaje al cambiar de pestaña para que corra la animación
        key={tab}
        className="os-enter"
      >
        {rows.length === 0 ? (
          <>
            <div className={cn("flex items-center justify-center", pendingLine ? "h-32" : "h-56")}>
              <p className="text-sm text-muted-foreground">Sin gastos en {monthName}.</p>
            </div>
            {pendingLine}
          </>
        ) : (
          <>
            <BreakdownBars
              rows={rows}
              total={total}
              currency={currency}
              caption={activeTab.srCaption}
              hidden={balanceHidden}
            />
            <div
              className="mt-4 pt-3 flex items-center justify-between"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <span className="text-xs text-muted-foreground">Total gastado</span>
              <span className="font-mono-num text-sm font-bold tabular-nums text-foreground">
                {money(total)}
              </span>
            </div>

            {pendingLine}

            {/* Era la única tarjeta sin salida: ni a reportes ni a movimientos */}
            <div className="mt-3 flex justify-end">
              <Link
                href="/transacciones"
                className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                Ver los movimientos <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
});
