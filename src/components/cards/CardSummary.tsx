"use client";

import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { CardFace } from "./CardFace";
import type { Doc } from "../../../convex/_generated/dataModel";

interface CardSummaryProps {
  card: Doc<"cards">;
  onClick?: () => void;
}

export function CardSummary({ card, onClick }: CardSummaryProps) {
  const usedPercent = card.creditLimit > 0
    ? Math.min(100, (card.currentBalance / card.creditLimit) * 100)
    : 0;
  const isHighUsage = usedPercent >= 80;
  const isMidUsage  = usedPercent >= 60;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left transition-transform active:scale-[0.985]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
      style={{ borderRadius: 22, border: "1px solid var(--border)", background: "var(--card)", overflow: "hidden" }}
    >
      {/* Cara de la tarjeta */}
      <CardFace
        brand={card.brand ?? "otro"}
        lastFourDigits={card.lastFourDigits}
        name={card.name}
        color={card.color}
        trailing={
          <span className="font-mono-num flex-shrink-0" style={{ fontWeight: 700 }}>
            {formatCents(card.currentBalance, card.currency)}
          </span>
        }
      />

      {/* Barra de uso + meta */}
      <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Usado <strong className="text-foreground">{usedPercent.toFixed(0)}%</strong></span>
          <span>Disponible <strong className="text-foreground">{formatCents(card.availableCredit, card.currency)}</strong></span>
        </div>
        <div className="progress-bar">
          <div
            className={cn("progress-bar-fill shimmer", isHighUsage ? "danger" : isMidUsage ? "warn" : "")}
            style={{ width: `${usedPercent}%` }}
          />
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground pt-1" style={{ borderTop: "1px solid var(--border)" }}>
          <span>Corte día <strong className="text-foreground">{card.cutoffDay}</strong></span>
          <span>·</span>
          <span>Pago día <strong className="text-foreground">{card.paymentDay}</strong></span>
          {card.interestRate && (
            <span>· <strong className="text-foreground">{(card.interestRate * 100).toFixed(1)}% m.v.</strong></span>
          )}
        </div>
      </div>
    </button>
  );
}
