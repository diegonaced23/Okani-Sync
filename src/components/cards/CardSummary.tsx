"use client";

import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { CreditCard } from "lucide-react";
import type { Doc } from "../../../convex/_generated/dataModel";

interface CardSummaryProps {
  card: Doc<"cards">;
  onClick?: () => void;
}

const BRAND_LABELS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "Amex",
  diners: "Diners",
  otro: "Crédito",
};

export function CardSummary({ card, onClick }: CardSummaryProps) {
  const usedPercent = card.creditLimit > 0
    ? Math.min(100, (card.currentBalance / card.creditLimit) * 100)
    : 0;
  const isHighUsage = usedPercent >= 80;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-xl border border-border bg-card p-4 space-y-3",
        "transition-colors hover:bg-muted/50 active:scale-[0.99]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: card.color + "22" }}
          >
            <CreditCard className="h-5 w-5" style={{ color: card.color }} />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-foreground truncate">{card.name}</p>
            <p className="text-xs text-muted-foreground">
              {card.bankName} · {BRAND_LABELS[card.brand ?? "otro"]} ···{card.lastFourDigits}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-muted-foreground">Deuda actual</p>
          <p className={cn("font-bold tabular-nums text-sm",
            card.currentBalance > 0 ? "text-danger" : "text-foreground"
          )}>
            {formatCents(card.currentBalance, card.currency)}
          </p>
        </div>
      </div>

      {/* Barra de uso del cupo */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Usado: {usedPercent.toFixed(0)}%</span>
          <span>Disponible: {formatCents(card.availableCredit, card.currency)}</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              isHighUsage ? "bg-danger" : "bg-accent"
            )}
            style={{ width: `${usedPercent}%` }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground text-right">
          Cupo total: {formatCents(card.creditLimit, card.currency)}
        </p>
      </div>

      {/* Días */}
      <div className="flex gap-4 text-xs text-muted-foreground pt-0.5 border-t border-border">
        <span>Corte: día {card.cutoffDay}</span>
        <span>Pago: día {card.paymentDay}</span>
        {card.interestRate && (
          <span>Tasa: {(card.interestRate * 100).toFixed(1)}% m.v.</span>
        )}
      </div>
    </button>
  );
}
