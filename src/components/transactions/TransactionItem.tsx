"use client";

import { formatCents } from "@/lib/money";
import { formatDateShort } from "@/lib/utils";
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, CreditCard, HandCoins, Scale } from "lucide-react";
import type { Doc } from "../../../convex/_generated/dataModel";

interface TransactionItemProps {
  transaction: Doc<"transactions">;
  categoryName?: string;
  onPress?: () => void;
}

const TYPE_CONFIG = {
  ingreso: {
    icon: ArrowDownLeft,
    iconColor: "var(--os-lime)",
    iconBg: "color-mix(in oklch, var(--os-lime) 18%, transparent)",
    amountColor: "var(--os-lime)",
    sign: "+",
  },
  gasto: {
    icon: ArrowUpRight,
    iconColor: "var(--os-magenta)",
    iconBg: "color-mix(in oklch, var(--os-magenta) 16%, transparent)",
    amountColor: "var(--foreground)",
    sign: "-",
  },
  transferencia: {
    icon: ArrowLeftRight,
    iconColor: "var(--os-cyan)",
    iconBg: "color-mix(in oklch, var(--os-cyan) 16%, transparent)",
    amountColor: "var(--muted-foreground)",
    sign: "",
  },
  pago_tarjeta: {
    icon: CreditCard,
    iconColor: "var(--os-orange)",
    iconBg: "color-mix(in oklch, var(--os-orange) 18%, transparent)",
    amountColor: "var(--foreground)",
    sign: "-",
  },
  pago_deuda: {
    icon: HandCoins,
    iconColor: "var(--os-orange)",
    iconBg: "color-mix(in oklch, var(--os-orange) 18%, transparent)",
    amountColor: "var(--foreground)",
    sign: "-",
  },
  ajuste: {
    icon: Scale,
    iconColor: "var(--muted-foreground)",
    iconBg: "color-mix(in oklch, var(--muted-foreground) 12%, transparent)",
    amountColor: "var(--muted-foreground)",
    sign: "",
  },
};

const TYPE_LABELS: Record<string, string> = {
  ingreso: "Ingreso", gasto: "Gasto", transferencia: "Transferencia",
  pago_tarjeta: "Pago tarjeta", pago_deuda: "Pago deuda",
  ajuste: "Ajuste",
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
          background: config.iconBg,
          color: config.iconColor,
        }}
      >
        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
      </span>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{tx.description}</p>
        <p className="text-xs text-muted-foreground">
          {categoryName ?? TYPE_LABELS[tx.type]} · {formatDateShort(tx.date)}
        </p>
      </div>

      <p
        className="text-sm font-bold tabular shrink-0"
        style={{ color: config.amountColor, letterSpacing: "-0.02em" }}
      >
        {config.sign}{formatCents(tx.amount, tx.currency)}
      </p>
    </button>
  );
}
