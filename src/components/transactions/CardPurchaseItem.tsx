"use client";

import { memo } from "react";
import type { Doc } from "../../../convex/_generated/dataModel";
import { formatCents } from "@/lib/money";
import { formatMonthShort } from "@/lib/utils";
import { ShoppingCart } from "lucide-react";

interface CardPurchaseItemProps {
  purchase: Doc<"cardPurchases">;
  cardName?: string;
  onPress?: (purchase: Doc<"cardPurchases">) => void;
}

// memo: evita re-renders cuando el padre actualiza estado no relacionado (ej. abrir sheets),
// igual patrón que TransactionItem con quien comparte la misma lista.
export const CardPurchaseItem = memo(function CardPurchaseItem({ purchase, cardName, onPress }: CardPurchaseItemProps) {
  const iconBg    = "color-mix(in oklch, var(--os-violet, var(--os-cyan)) 16%, transparent)";
  const iconColor = "var(--os-violet-text, var(--os-cyan-text))";

  const subtitleParts: string[] = [];
  if (purchase.totalInstallments > 1) {
    subtitleParts.push(`${purchase.totalInstallments} cuotas · 1ª en ${formatMonthShort(purchase.firstInstallmentDate)}`);
  } else {
    subtitleParts.push(`1 cuota · ${formatMonthShort(purchase.firstInstallmentDate)}`);
  }
  if (cardName) subtitleParts.push(cardName);

  return (
    <button
      type="button"
      onClick={onPress ? () => onPress(purchase) : undefined}
      className="flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition-colors hover:bg-muted/50 active:bg-muted/70"
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px]"
        style={{ background: iconBg, color: iconColor }}
      >
        <ShoppingCart className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold leading-tight text-foreground">
          {purchase.description}
        </p>
        <p className="mt-0.5 truncate text-xs leading-tight text-muted-foreground">
          {subtitleParts.join(" · ")}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="font-mono-num text-sm font-bold leading-tight tabular-nums text-foreground">
          −{formatCents(purchase.totalWithInterest, purchase.currency)}
        </span>
        <span
          className="inline-flex items-center rounded-full px-2 py-px text-[11px] font-semibold"
          style={{ background: iconBg, color: iconColor }}
        >
          Compra
        </span>
      </div>
    </button>
  );
});
