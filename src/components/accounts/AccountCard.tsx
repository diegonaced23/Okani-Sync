"use client";

import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { GRADIENT_MAP, ACCOUNT_GRADIENTS } from "@/lib/constants";
import type { Doc } from "../../../convex/_generated/dataModel";
import { Wallet } from "lucide-react";

interface AccountCardProps {
  account: Doc<"accounts">;
  isShared?: boolean;
  onClick?: () => void;
}

const TYPE_LABELS: Record<Doc<"accounts">["type"], string> = {
  billetera: "Billetera",
  bancaria:  "Bancaria",
  ahorros:   "Ahorros",
  inversion: "Inversión",
};

function resolveCard(color: string) {
  const g = GRADIENT_MAP[color];
  if (g) return { background: g.gradient, darkText: g.darkText };
  return { background: ACCOUNT_GRADIENTS[0].gradient, darkText: false };
}

export function AccountCard({ account, isShared, onClick }: AccountCardProps) {
  const { background, darkText } = resolveCard(account.color);
  const textColor = darkText ? "oklch(0.18 0.02 260)" : "white";
  const isNegative = account.balance < 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left relative overflow-hidden transition-transform active:scale-[0.985]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
      style={{
        borderRadius: 22,
        padding: 18,
        background,
        color: textColor,
        minHeight: 130,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        boxShadow: "var(--shadow-md)",
      }}
    >
      {/* Arco decorativo */}
      <span aria-hidden style={{
        position: "absolute", top: -70, right: -70,
        width: 180, height: 180, borderRadius: "50%",
        border: "28px solid oklch(1 0 0 / 0.10)",
        pointerEvents: "none",
      }} />

      {/* Fila superior: chip + tipo */}
      <div className="flex justify-between items-start">
        {/* Chip EMV / ícono billetera */}
        {account.type === "billetera" ? (
          <span aria-hidden style={{ flexShrink: 0, opacity: 0.85 }}>
            <Wallet style={{ width: 26, height: 26 }} strokeWidth={1.8} />
          </span>
        ) : (
          <span aria-hidden style={{
            width: 32, height: 22, borderRadius: 5,
            background: "linear-gradient(135deg, oklch(0.85 0.05 90), oklch(0.65 0.08 60))",
            flexShrink: 0, position: "relative",
          }} />
        )}
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", opacity: 0.85 }}>
          {account.bankName ?? TYPE_LABELS[account.type]}
          {isShared && " · Compartida"}
        </span>
      </div>

      {/* Fila inferior: nombre + saldo + meta */}
      <div>
        <p style={{ fontSize: 11, fontWeight: 600, opacity: 0.80, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 2 }}>
          {account.name}
        </p>
        <p className={cn("font-mono-num", isNegative ? "opacity-70" : "")} style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
          {formatCents(account.balance, account.currency)}
        </p>
        <p className="flex justify-between items-end" style={{ fontSize: 11, opacity: 0.72, marginTop: 4 }}>
          <span>{account.accountNumber ? `···${account.accountNumber}` : TYPE_LABELS[account.type]}</span>
          <span>{account.currency}</span>
        </p>
      </div>
    </button>
  );
}
