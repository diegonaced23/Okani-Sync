"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AppSheet } from "@/components/ui/app-sheet";
import { formatCents } from "@/lib/money";
import { formatDateShort } from "@/lib/utils";
import { Check, Clock, CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface CardPurchaseDetailSheetProps {
  purchaseId: Id<"cardPurchases"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatMonth(ts: number): string {
  return format(new Date(ts), "MMMM 'de' yyyy", { locale: es });
}

export function CardPurchaseDetailSheet({
  purchaseId,
  open,
  onOpenChange,
}: CardPurchaseDetailSheetProps) {
  const data = useQuery(
    api.cardPurchases.getWithInstallments,
    purchaseId ? { purchaseId } : "skip"
  );

  const { purchase, installments, card } = data ?? {};

  if (!purchaseId) return null;

  const paidCount   = purchase?.paidInstallments ?? 0;
  const totalCount  = purchase?.totalInstallments ?? 1;
  const progress    = totalCount > 0 ? (paidCount / totalCount) * 100 : 0;

  const amountPaid    = (installments ?? []).filter((i) => i.paid).reduce((s, i) => s + i.amount, 0);
  const amountPending = (purchase?.totalWithInterest ?? 0) - amountPaid;

  const currentInstallment = (installments ?? []).find(
    (inst, idx, arr) => !inst.paid && (idx === 0 || arr[idx - 1].paid)
  );

  return (
    <AppSheet open={open} onOpenChange={onOpenChange} title="Detalle de compra">
      {!purchase ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-14 rounded-xl animate-pulse"
              style={{ background: "var(--surface-2)" }}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-5">

          {/* ── Cabecera ── */}
          <div
            className="rounded-2xl p-4 space-y-1"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          >
            <p className="font-semibold text-foreground text-base leading-tight">
              {purchase.description}
            </p>
            {card && (
              <p className="text-xs text-muted-foreground">
                {card.name} ····{card.lastFourDigits}
              </p>
            )}
            <div className="flex items-baseline gap-1.5 pt-1">
              <span
                className="font-mono-num font-bold text-foreground"
                style={{ fontSize: 26, letterSpacing: "-0.025em" }}
              >
                {formatCents(purchase.totalWithInterest, purchase.currency)}
              </span>
              <span className="text-xs text-muted-foreground">total</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Compra del {formatDateShort(purchase.purchaseDate)}
            </p>
          </div>

          {/* ── Barra de progreso ── */}
          <div className="space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Progreso
              </span>
              <span className="text-xs font-bold text-foreground">
                {paidCount} de {totalCount} cuotas
              </span>
            </div>

            <div
              className="h-2 rounded-full overflow-hidden"
              style={{ background: "var(--muted)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progress}%`,
                  background: progress >= 100
                    ? "var(--os-lime)"
                    : "linear-gradient(90deg, var(--os-cyan), var(--os-lime))",
                }}
              />
            </div>

            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Pagado: {formatCents(amountPaid, purchase.currency)}</span>
              {amountPending > 0 && (
                <span>Pendiente: {formatCents(amountPending, purchase.currency)}</span>
              )}
            </div>

            {currentInstallment && amountPending > 0 && (
              <p className="text-xs text-muted-foreground">
                Próxima cuota en {formatMonth(currentInstallment.dueDate)}
              </p>
            )}
          </div>

          {/* ── Cronograma ── */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Cronograma
            </p>
            <div
              className="rounded-xl overflow-hidden divide-y"
              style={{ border: "1px solid var(--border)" }}
            >
              {(installments ?? []).map((inst, idx, arr) => {
                const isCurrent = !inst.paid && (idx === 0 || arr[idx - 1].paid);
                return (
                  <div
                    key={inst._id}
                    className="flex items-center gap-3 px-4 py-3"
                    style={{
                      background: isCurrent
                        ? "color-mix(in oklch, var(--os-cyan) 8%, var(--surface-2))"
                        : "var(--surface-2)",
                    }}
                  >
                    <span
                      className="flex-shrink-0 flex items-center justify-center rounded-full"
                      style={{
                        width: 28, height: 28,
                        background: inst.paid
                          ? "color-mix(in oklch, var(--os-lime) 18%, transparent)"
                          : isCurrent
                            ? "color-mix(in oklch, var(--os-cyan) 18%, transparent)"
                            : "var(--muted)",
                        color: inst.paid
                          ? "var(--os-lime)"
                          : isCurrent
                            ? "var(--os-cyan)"
                            : "var(--muted-foreground)",
                      }}
                    >
                      {inst.paid
                        ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                        : <Clock className="h-3.5 w-3.5" strokeWidth={2} />
                      }
                    </span>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        Cuota {inst.installmentNumber}/{totalCount}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateShort(inst.dueDate)}
                      </p>
                    </div>

                    <span
                      className="font-mono-num text-sm font-bold shrink-0"
                      style={{
                        color: inst.paid ? "var(--muted-foreground)" : "var(--foreground)",
                        textDecoration: inst.paid ? "line-through" : "none",
                      }}
                    >
                      {formatCents(inst.amount, purchase.currency)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Info de interés ── */}
          {purchase.hasInterest && (purchase.totalInterest ?? 0) > 0 && (
            <div
              className="rounded-xl p-3 flex items-start gap-2"
              style={{
                background: "color-mix(in oklch, var(--os-orange) 8%, transparent)",
                border: "1px solid color-mix(in oklch, var(--os-orange) 20%, transparent)",
              }}
            >
              <CalendarDays className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "var(--os-orange)" }} />
              <p className="text-xs text-muted-foreground">
                Interés total: {formatCents(purchase.totalInterest!, purchase.currency)}{" "}
                ({((purchase.interestRate ?? 0) * 100).toFixed(1)}% mensual)
              </p>
            </div>
          )}

        </div>
      )}
    </AppSheet>
  );
}
