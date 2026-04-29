"use client";

import { formatCents } from "@/lib/money";
import { cn, formatDateShort } from "@/lib/utils";
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, CreditCard, HandCoins } from "lucide-react";
import type { Doc } from "../../../convex/_generated/dataModel";

interface TransactionItemProps {
  transaction: Doc<"transactions">;
  categoryName?: string;
  onPress?: () => void;
}

const TYPE_CONFIG = {
  ingreso: {
    icon: ArrowDownLeft,
    colorVar: "var(--os-lime)",
    bgVar: "color-mix(in oklch, var(--os-lime) 18%, transparent)",
    sign: "+",
  },
  gasto: {
    icon: ArrowUpRight,
    colorVar: "var(--os-magenta)",
    bgVar: "color-mix(in oklch, var(--os-magenta) 16%, transparent)",
    sign: "-",
  },
  transferencia: {
    icon: ArrowLeftRight,
    colorVar: "var(--os-cyan)",
    bgVar: "color-mix(in oklch, var(--os-cyan) 16%, transparent)",
    sign: "",
  },
  pago_tarjeta: {
    icon: CreditCard,
    colorVar: "var(--os-orange)",
    bgVar: "color-mix(in oklch, var(--os-orange) 18%, transparent)",
    sign: "-",
  },
  pago_deuda: {
    icon: HandCoins,
    colorVar: "var(--os-orange)",
    bgVar: "color-mix(in oklch, var(--os-orange) 18%, transparent)",
    sign: "-",
  },
};

const TYPE_LABELS: Record<string, string> = {
  ingreso: "Ingreso", gasto: "Gasto", transferencia: "Transferencia",
  pago_tarjeta: "Pago tarjeta", pago_deuda: "Pago deuda",
};

export function TransactionItem({ transaction: tx, categoryName, onPress }: TransactionItemProps) {
  const config = TYPE_CONFIG[tx.type];
  const Icon = config.icon;

  return (
    <button
      type="button"
      onClick={onPress}
      className="w-full flex items-center gap-3 px-4 py-3 transition-colors text-left"
      style={{ background: "none" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--muted)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "none"; }}
    >
      <span
        className="flex shrink-0 items-center justify-center"
        style={{
          width: 40, height: 40,
          borderRadius: 13,
          background: config.bgVar,
          color: config.colorVar,
        }}
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{tx.description}</p>
        <p className="text-xs text-muted-foreground">
          {categoryName ?? TYPE_LABELS[tx.type]} · {formatDateShort(tx.date)}
        </p>
      </div>

      <p
        className={cn("text-sm font-bold tabular shrink-0")}
        style={{ color: config.colorVar, letterSpacing: "-0.02em" }}
      >
        {config.sign}{formatCents(tx.amount, tx.currency)}
      </p>
    </button>
  );
}
