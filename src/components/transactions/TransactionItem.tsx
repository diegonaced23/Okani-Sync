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
    color: "text-accent",
    bg: "bg-accent/10",
    label: "Ingreso",
    sign: "+",
  },
  gasto: {
    icon: ArrowUpRight,
    color: "text-danger",
    bg: "bg-danger/10",
    label: "Gasto",
    sign: "-",
  },
  transferencia: {
    icon: ArrowLeftRight,
    color: "text-info",
    bg: "bg-info/10",
    label: "Transferencia",
    sign: "",
  },
  pago_tarjeta: {
    icon: CreditCard,
    color: "text-warning",
    bg: "bg-warning/10",
    label: "Pago tarjeta",
    sign: "-",
  },
  pago_deuda: {
    icon: HandCoins,
    color: "text-warning",
    bg: "bg-warning/10",
    label: "Pago deuda",
    sign: "-",
  },
};

export function TransactionItem({ transaction: tx, categoryName, onPress }: TransactionItemProps) {
  const config = TYPE_CONFIG[tx.type];
  const Icon = config.icon;

  return (
    <button
      type="button"
      onClick={onPress}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
    >
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", config.bg)}>
        <Icon className={cn("h-4 w-4", config.color)} />
      </span>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{tx.description}</p>
        <p className="text-xs text-muted-foreground">
          {categoryName ?? config.label} · {formatDateShort(tx.date)}
        </p>
      </div>

      <p className={cn("text-sm font-semibold tabular-nums shrink-0", config.color)}>
        {config.sign}{formatCents(tx.amount, tx.currency)}
      </p>
    </button>
  );
}
