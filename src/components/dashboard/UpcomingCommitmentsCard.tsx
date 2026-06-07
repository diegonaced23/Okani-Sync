"use client";

import { formatCents } from "@/lib/money";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, CreditCard, RefreshCw, HandCoins, Clock } from "lucide-react";
import Link from "next/link";

type CommitmentItem = {
  type: "cuota_tarjeta" | "deuda" | "recurrente";
  amount: number;
  dueDate: number;
  description: string;
  cardName?: string;
};

interface UpcomingCommitmentsCardProps {
  data: {
    totalAmount: number;
    currency: string;
    missingRates: string[];
    items: CommitmentItem[];
  } | null | undefined;
  loading?: boolean;
}

// Capturado al cargar el módulo — Date.now() en render es impuro para el React Compiler
const SESSION_NOW = Date.now();
const MS_PER_DAY = 86_400_000;

const MAX_VISIBLE = 8;

function ItemIcon({ type }: { type: CommitmentItem["type"] }) {
  if (type === "cuota_tarjeta") return <CreditCard size={14} />;
  if (type === "deuda")        return <HandCoins size={14} />;
  return <RefreshCw size={14} />;
}

function DateBadge({ dueDate }: { dueDate: number }) {
  const days = Math.ceil((dueDate - SESSION_NOW) / MS_PER_DAY);

  let text: string;
  let color: string;

  if (days < 0) {
    text = "Vencido";
    color = "var(--destructive)";
  } else if (days === 0) {
    text = "Hoy";
    color = "var(--destructive)";
  } else if (days === 1) {
    text = "Mañana";
    // var(--warning-text) garantiza contraste ≥4.5:1 en texto sobre fondo de tarjeta
    color = "var(--warning-text)";
  } else if (days <= 7) {
    text = `En ${days} días`;
    color = "var(--warning-text)";
  } else {
    const date = new Date(dueDate).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
    text = date;
    color = "var(--muted-foreground)";
  }

  return (
    <span style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: "0.04em" }}>
      {text}
    </span>
  );
}

export function UpcomingCommitmentsCard({ data, loading }: UpcomingCommitmentsCardProps) {
  // undefined = consulta cargando → skeleton; null = sin datos disponibles → mensaje vacío
  if (loading || data === undefined) {
    return (
      <section className="space-y-2.5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-bold text-foreground">Próximos 30 días</h2>
        </div>
        <div className="rounded-xl bg-card border border-border overflow-hidden p-4 space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
        </div>
      </section>
    );
  }

  if (data === null) {
    return (
      <section className="space-y-2.5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-bold text-foreground">Próximos 30 días</h2>
        </div>
        <div className="rounded-xl bg-card border border-border overflow-hidden">
          <p className="text-sm text-muted-foreground py-8 text-center">
            No se pudieron cargar los compromisos próximos.
          </p>
        </div>
      </section>
    );
  }

  const { totalAmount, currency, missingRates, items } = data;
  const visible = items.slice(0, MAX_VISIBLE);
  const hidden = items.length - visible.length;

  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
          <Clock size={14} className="text-muted-foreground" />
          Próximos 30 días
          {items.length > 0 && (
            <span
              className="inline-flex items-center justify-center rounded-full"
              style={{ minWidth: 18, height: 18, padding: "0 5px", fontSize: 10, fontWeight: 800, background: "color-mix(in oklch, var(--os-lime) 20%, var(--card))", color: "var(--os-lime)", border: "1px solid color-mix(in oklch, var(--os-lime) 30%, transparent)" }}
            >
              {items.length}
            </span>
          )}
        </h2>
        {totalAmount > 0 && (
          // Muestra "≈" e ícono cuando faltan tasas; title detalla qué monedas y cuándo se actualizan
          <span
            className="flex items-center gap-1 text-xs font-bold text-foreground"
            title={missingRates.length > 0 ? `Total aproximado — tasas de ${missingRates.join(", ")} no disponibles. Se actualizan automáticamente cada día.` : undefined}
          >
            {missingRates.length > 0 && <AlertTriangle size={11} aria-hidden="true" className="text-muted-foreground" />}
            {missingRates.length > 0 ? "≈ " : ""}{formatCents(totalAmount, currency)}
          </span>
        )}
      </div>

      <div className="rounded-xl bg-card border border-border overflow-hidden">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Sin compromisos en los próximos 30 días.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {visible.map((item: CommitmentItem, idx: number) => (
                <li key={idx} className="px-4 py-3 flex items-center gap-3 transition-colors hover:bg-muted/40">
                  {/* Icono decorativo — el tipo se anuncia con sr-only en la descripción */}
                  <span
                    aria-hidden="true"
                    className="flex items-center justify-center shrink-0"
                    style={{
                      width: 32, height: 32, borderRadius: 10,
                      background: item.type === "cuota_tarjeta"
                        ? "color-mix(in oklch, #6366F1 15%, var(--card))"
                        : item.type === "deuda"
                        ? "color-mix(in oklch, var(--destructive) 15%, var(--card))"
                        : "color-mix(in oklch, var(--os-lime) 15%, var(--card))",
                      color: item.type === "cuota_tarjeta"
                        ? "#6366F1"
                        : item.type === "deuda"
                        ? "var(--destructive)"
                        : "var(--os-lime)",
                    }}
                  >
                    <ItemIcon type={item.type} />
                  </span>

                  {/* Descripción + subtítulo */}
                  <div className="flex-1 min-w-0">
                    {/* sr-only: tipo de compromiso — el icono es decorativo y no lo anuncia */}
                    <span className="sr-only">
                      {item.type === "cuota_tarjeta" ? "Cuota de tarjeta" : item.type === "deuda" ? "Deuda" : "Recurrente"}:{" "}
                    </span>
                    <p className="text-sm font-semibold text-foreground truncate">
                      {item.description}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <DateBadge dueDate={item.dueDate} />
                      {item.cardName && (
                        <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>
                          · {item.cardName}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Monto */}
                  <span className="text-sm font-bold text-foreground shrink-0 tabular-nums">
                    {formatCents(item.amount, currency)}
                  </span>
                </li>
              ))}
            </ul>

            {hidden > 0 && (
              <div className="px-4 py-2.5 border-t border-border flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {hidden} compromiso{hidden !== 1 ? "s" : ""} más
                </span>
                <div className="flex items-center gap-3">
                  <Link href="/tarjetas" className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors py-2 -my-2 px-1">
                    Ver tarjetas
                  </Link>
                  <Link href="/deudas" className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors py-2 -my-2 px-1">
                    Ver deudas
                  </Link>
                </div>
              </div>
            )}

          </>
        )}
      </div>
    </section>
  );
}
