"use client";

import { formatCents } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Doc } from "../../../convex/_generated/dataModel";

interface AccountCardProps {
  account: Doc<"accounts">;
  isShared?: boolean;
  onClick?: () => void;
}

const TYPE_LABELS: Record<Doc<"accounts">["type"], string> = {
  billetera: "Billetera",
  bancaria: "Bancaria",
  ahorros: "Ahorros",
  inversion: "Inversión",
};

export function AccountCard({ account, isShared, onClick }: AccountCardProps) {
  const isNegative = account.balance < 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-xl p-4 border border-border bg-card",
        "transition-colors hover:bg-muted/50 active:scale-[0.99]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg"
            style={{ backgroundColor: account.color + "22", color: account.color }}
          >
            💳
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-foreground truncate">{account.name}</p>
            <p className="text-xs text-muted-foreground">
              {account.bankName ?? TYPE_LABELS[account.type]}
              {account.accountNumber && ` ···${account.accountNumber}`}
            </p>
          </div>
        </div>

        <div className="text-right shrink-0">
          <p
            className={cn(
              "font-bold tabular-nums",
              isNegative ? "text-danger" : "text-foreground"
            )}
          >
            {formatCents(account.balance, account.currency)}
          </p>
          <div className="flex items-center justify-end gap-1 mt-0.5">
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {account.currency}
            </Badge>
            {isShared && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                Compartida
              </Badge>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
