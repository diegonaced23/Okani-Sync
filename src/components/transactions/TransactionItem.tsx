"use client";

import { formatCents } from "@/lib/money";
import { formatDateShort } from "@/lib/utils";
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, CreditCard, HandCoins, Scale } from "lucide-react";
import type { Doc } from "../../../convex/_generated/dataModel";
import { CategoryIcon } from "@/components/ui/category-icon";

interface CategoryInfo {
  name: string;
  icon: string;
  color: string;
}

interface CardInfo {
  name: string;
  lastFourDigits: string;
}

interface TransactionItemProps {
  transaction: Doc<"transactions">;
  category?: CategoryInfo;
  categoryName?: string; // compatibilidad con páginas que solo tienen el nombre
  accountMap?: Record<string, string>;
  cardMap?: Record<string, CardInfo>;
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
  gasto_tarjeta: {
    icon: CreditCard,
    iconColor: "var(--os-cyan)",
    iconBg: "color-mix(in oklch, var(--os-cyan) 18%, transparent)",
    amountColor: "var(--muted-foreground)",
    sign: "·",
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

export function TransactionItem({
  transaction: tx,
  category,
  categoryName: categoryNameFallback,
  accountMap,
  cardMap,
  onPress,
}: TransactionItemProps) {
  const config = TYPE_CONFIG[tx.type];
  const Icon = config.icon;

  // ── Icono: emoji de categoría si existe, si no el icono de tipo ─────────────
  const hasCategory = !!category;
  const iconBg = hasCategory
    ? `color-mix(in oklch, ${category.color} 18%, transparent)`
    : config.iconBg;
  const iconColor = hasCategory ? category.color : config.iconColor;

  // ── Signo y color del monto ──────────────────────────────────────────────────
  let sign = config.sign;
  let amountColor = config.amountColor;

  // ── Línea de subtítulo: categoría · fuente · fecha ──────────────────────────
  const subtitleParts: string[] = [];

  if (tx.type === "transferencia") {
    if (accountMap) {
      const from = accountMap[tx.accountId   ?? ""] ?? "Cuenta";
      const to   = accountMap[tx.toAccountId ?? ""] ?? "Cuenta";
      if (tx.transferDirection === "out") {
        sign = "−";
        amountColor = "var(--foreground)";
        subtitleParts.push(`${from} → ${to}`);
      } else if (tx.transferDirection === "in") {
        sign = "+";
        amountColor = "var(--os-lime)";
        subtitleParts.push(`${from} → ${to}`);
      } else {
        subtitleParts.push("Transferencia");
      }
    }
  } else {
    // 1. Categoría
    const resolvedCatName = category?.name ?? categoryNameFallback;
    if (resolvedCatName) subtitleParts.push(resolvedCatName);

    // 2. Cuenta o tarjeta origen
    if (tx.accountId && accountMap) {
      const name = accountMap[tx.accountId];
      if (name) subtitleParts.push(name);
    }
    if (tx.cardId && cardMap) {
      const card = cardMap[tx.cardId];
      if (card) subtitleParts.push(`${card.name} ···${card.lastFourDigits}`);
    }
  }

  // 3. Fecha
  subtitleParts.push(formatDateShort(tx.date));

  const subtitle = subtitleParts.filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      onClick={onPress}
      className="w-full flex items-center gap-3 px-4 py-3 transition-colors text-left"
      style={{ background: "none" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--muted)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "none"; }}
    >
      {/* Icono */}
      <span
        className="flex shrink-0 items-center justify-center"
        style={{
          width: 40, height: 40,
          borderRadius: 13,
          background: iconBg,
          color: iconColor,
        }}
      >
        {hasCategory
          ? <CategoryIcon name={category.icon} className="h-[18px] w-[18px]" aria-hidden="true" />
          : <Icon className="h-[18px] w-[18px]" aria-hidden="true" />}
      </span>

      {/* Texto */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{tx.description}</p>
        <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
      </div>

      {/* Monto */}
      <p
        className="text-sm font-bold tabular shrink-0"
        style={{ color: amountColor, letterSpacing: "-0.02em" }}
      >
        {sign}{formatCents(tx.amount, tx.currency)}
      </p>
    </button>
  );
}
