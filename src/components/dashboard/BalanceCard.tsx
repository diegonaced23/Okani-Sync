"use client";

import { formatCents } from "@/lib/money";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle } from "lucide-react";

interface BalanceCardProps {
  total: number | null | undefined;
  currency: string;
  missingRates?: string[];
  accountCount?: number;
  loading?: boolean;
}

export function BalanceCard({
  total,
  currency,
  missingRates = [],
  accountCount = 0,
  loading,
}: BalanceCardProps) {
  if (loading || total === undefined) {
    return <Skeleton className="h-32 rounded-2xl" />;
  }

  const isNegative = (total ?? 0) < 0;

  return (
    <div className="rounded-2xl bg-card border border-border p-5 space-y-1">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Balance total · {accountCount} cuenta{accountCount !== 1 ? "s" : ""}
      </p>
      <p
        className={`text-4xl font-bold tabular-nums tracking-tight ${
          isNegative ? "text-danger" : "text-foreground"
        }`}
      >
        {formatCents(total ?? 0, currency)}
      </p>
      <p className="text-xs text-muted-foreground">{currency}</p>

      {missingRates.length > 0 && (
        <div className="flex items-center gap-1.5 pt-1 text-warning text-xs">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>
            Sin tasa de cambio para: {missingRates.join(", ")}. Saldo en moneda original incluido sin convertir.
          </span>
        </div>
      )}
    </div>
  );
}
