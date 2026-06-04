"use client";

import type { Doc } from "../../../convex/_generated/dataModel";
import { formatCents } from "@/lib/money";
import { ShoppingCart } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface CardPurchaseItemProps {
  purchase: Doc<"cardPurchases">;
  cardName?: string;
  onPress?: () => void;
}

function formatMonth(ts: number): string {
  return format(new Date(ts), "MMM. yyyy", { locale: es });
}

export function CardPurchaseItem({ purchase, cardName, onPress }: CardPurchaseItemProps) {
  const iconBg    = "color-mix(in oklch, var(--os-violet, var(--os-cyan)) 16%, transparent)";
  const iconColor = "var(--os-violet, var(--os-cyan))";

  const subtitleParts: string[] = [];
  if (purchase.totalInstallments > 1) {
    subtitleParts.push(`${purchase.totalInstallments} cuotas · 1ª en ${formatMonth(purchase.firstInstallmentDate)}`);
  } else {
    subtitleParts.push(`1 cuota · ${formatMonth(purchase.firstInstallmentDate)}`);
  }
  if (cardName) subtitleParts.push(cardName);

  return (
    <button
      type="button"
      onClick={onPress}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-muted/50"
      style={{ background: "transparent" }}
    >
      <span
        className="flex shrink-0 items-center justify-center rounded-2xl"
        style={{ width: 44, height: 44, background: iconBg, color: iconColor }}
      >
        <ShoppingCart className="h-[20px] w-[20px]" strokeWidth={1.8} aria-hidden />
      </span>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate leading-tight">
          {purchase.description}
        </p>
        <p className="text-xs text-muted-foreground truncate mt-0.5 leading-tight">
          {subtitleParts.join(" · ")}
        </p>
      </div>

      <div className="flex flex-col items-end gap-1 shrink-0">
        <span
          className="font-mono-num font-bold text-sm leading-tight"
          style={{ color: "var(--foreground)" }}
        >
          -{formatCents(purchase.totalWithInterest, purchase.currency)}
        </span>
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: iconBg, color: iconColor, letterSpacing: "0.03em" }}
        >
          Compra
        </span>
      </div>
    </button>
  );
}
