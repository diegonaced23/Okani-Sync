"use client";

import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { GRADIENT_MAP, ACCOUNT_GRADIENTS } from "@/lib/constants";
import type { Doc } from "../../../convex/_generated/dataModel";
import { Landmark, PiggyBank, TrendingDown, TrendingUp, Users, Wallet, type LucideIcon } from "lucide-react";

export type AccountSummary = Pick<
  Doc<"accounts">,
  "_id" | "name" | "type" | "balance" | "currency" | "color" | "bankName" | "accountNumber"
>;

interface AccountCardProps {
  account: AccountSummary;
  isShared?: boolean;
  onClick?: () => void;
  /**
   * "tile": alto fijo que marca el contenedor, sin sombra ni elevación propias
   * (las pone CardTilt en el carrusel del dashboard).
   */
  variant?: "default" | "tile";
  /** Oculta el saldo (preferencia del ojo del dashboard) */
  hideBalance?: boolean;
}

const TYPE_META: Record<Doc<"accounts">["type"], { label: string; icon: LucideIcon }> = {
  billetera: { label: "Efectivo",  icon: Wallet },
  bancaria:  { label: "Bancaria",  icon: Landmark },
  ahorros:   { label: "Ahorros",   icon: PiggyBank },
  inversion: { label: "Inversión", icon: TrendingUp },
};

/** "Itaú · Ahorros · ···9565"; la billetera solo dice "Efectivo". */
function subtitle(account: AccountSummary) {
  if (account.type === "billetera") return TYPE_META.billetera.label;
  return [
    account.bankName,
    TYPE_META[account.type].label,
    account.accountNumber ? `···${account.accountNumber}` : undefined,
  ].filter(Boolean).join(" · ");
}

/**
 * Ficha de cuenta. A propósito NO imita un plástico (sin degradado de fondo, chip
 * ni número enmascarado): eso queda para las tarjetas de crédito (CardFace), para
 * que ambas se distingan de un vistazo. El color de la cuenta vive solo en la
 * pastilla del ícono.
 */
export function AccountCard({ account, isShared, onClick, variant = "default", hideBalance }: AccountCardProps) {
  const isTile = variant === "tile";
  const g = GRADIENT_MAP[account.color] ?? ACCOUNT_GRADIENTS[0];
  const { icon: Icon } = TYPE_META[account.type];
  const isNegative = account.balance < 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-[20px] border-[1.5px] border-transparent p-4",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isTile
          ? "flex h-full flex-col"
          : cn(
              "shadow-[inset_0_1px_0_oklch(1_0_0/0.6),0_1px_2px_oklch(0_0_0/0.06),0_6px_16px_-10px_oklch(0_0_0/0.2)]",
              "dark:shadow-[inset_0_1px_0_oklch(1_0_0/0.06),0_6px_16px_-10px_oklch(0_0_0/0.5)]",
              "transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[inset_0_1px_0_oklch(1_0_0/0.6),0_14px_28px_-14px_oklch(0_0_0/0.3)]",
              "active:scale-[0.985]"
            )
      )}
      style={{
        // Borde con el color de la cuenta que se funde con el borde neutro: identidad
        // sin volver al plástico (el degradado de fondo queda para las tarjetas)
        background: `linear-gradient(var(--card), var(--card)) padding-box,
          linear-gradient(135deg, color-mix(in oklch, ${g.preview} 75%, transparent), var(--border) 55%) border-box`,
      }}
    >
      <div className="flex items-start gap-3">
        {/* El ring separa del fondo los colores oscuros (p. ej. "Noche") en modo oscuro */}
        <span
          aria-hidden
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-white/15"
          style={{ background: g.gradient, color: g.darkText ? "oklch(0.18 0.02 260)" : "white" }}
        >
          <Icon className="h-5 w-5" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-foreground">{account.name}</p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            {isShared && <Users className="h-3 w-3 flex-shrink-0" aria-label="Compartida" />}
            <span className="truncate">{subtitle(account)}</span>
          </p>
        </div>
        {/* El sobregiro ocupa el lugar de la moneda para no agrandar la ficha;
            la moneda sigue visible en el símbolo del saldo */}
        {isNegative ? (
          <span className="flex flex-shrink-0 items-center gap-1 rounded-md bg-danger/10 px-1.5 py-0.5 text-[10px] font-bold text-danger">
            <TrendingDown className="h-3 w-3" aria-hidden="true" />
            Sobregiro
          </span>
        ) : (
          <span className="flex-shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {account.currency}
          </span>
        )}
      </div>

      <p className={cn(
        "font-mono-num text-2xl font-extrabold tracking-tight whitespace-nowrap",
        isTile ? "mt-auto" : "mt-4",
        isNegative ? "text-danger" : "text-foreground"
      )}>
        {hideBalance ? "$ ••••••" : formatCents(account.balance, account.currency)}
      </p>
    </button>
  );
}
