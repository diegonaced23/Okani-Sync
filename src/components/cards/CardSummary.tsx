"use client";

import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { GRADIENT_MAP, ACCOUNT_GRADIENTS } from "@/lib/constants";
import type { Doc } from "../../../convex/_generated/dataModel";

interface CardSummaryProps {
  card: Doc<"cards">;
  onClick?: () => void;
}

const BRAND_LABELS: Record<string, string> = {
  visa: "VISA", mastercard: "Mastercard", amex: "Amex", diners: "Diners", otro: "Crédito",
};

function resolveCard(color: string) {
  const g = GRADIENT_MAP[color];
  if (g) return { background: g.gradient, darkText: g.darkText };
  return { background: ACCOUNT_GRADIENTS[0].gradient, darkText: false };
}

export function CardSummary({ card, onClick }: CardSummaryProps) {
  const usedPercent = card.creditLimit > 0
    ? Math.min(100, (card.currentBalance / card.creditLimit) * 100)
    : 0;
  const isHighUsage = usedPercent >= 80;
  const isMidUsage  = usedPercent >= 60;
  const { background, darkText } = resolveCard(card.color);
  const textColor = darkText ? "oklch(0.18 0.02 260)" : "white";

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
      <div
        className="relative overflow-hidden"
        style={{ background, color: textColor, padding: 18, minHeight: 120 }}
      >
        <span aria-hidden style={{
          position: "absolute", top: -50, right: -50,
          width: 150, height: 150, borderRadius: "50%",
          border: "22px solid oklch(1 0 0 / 0.12)",
          pointerEvents: "none",
        }} />
        <div className="flex justify-between items-start mb-5">
          <span aria-hidden style={{
            width: 32, height: 22, borderRadius: 5,
            background: "linear-gradient(135deg, oklch(0.85 0.05 90), oklch(0.65 0.08 60))",
          }} />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", opacity: 0.85 }}>
            {BRAND_LABELS[card.brand ?? "otro"]}
          </span>
        </div>
        <p className="font-mono-num" style={{ fontSize: 15, letterSpacing: "0.18em", fontWeight: 600, opacity: 0.90 }}>
          •••• •••• •••• {card.lastFourDigits}
        </p>
        <div className="flex justify-between items-end mt-2" style={{ fontSize: 11, opacity: 0.80 }}>
          <span>{card.name}</span>
          <span className="font-mono-num" style={{ fontWeight: 700 }}>
            {formatCents(card.currentBalance, card.currency)}
          </span>
        </div>
      </div>

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
