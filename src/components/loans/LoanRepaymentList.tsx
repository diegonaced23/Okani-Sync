"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCents } from "@/lib/money";
import { formatDateShort } from "@/lib/utils";

interface LoanRepaymentListProps {
  loanId: Id<"loans">;
  currency: string;
}

export function LoanRepaymentList({ loanId, currency }: LoanRepaymentListProps) {
  const repayments = useQuery(api.loanRepayments.listByLoan, { loanId });

  if (repayments === undefined) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
      </div>
    );
  }

  if (repayments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center rounded-xl bg-card border border-border">
        Aún no hay abonos registrados.
      </p>
    );
  }

  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      {repayments.map((r, i) => (
        <div
          key={r._id}
          className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent text-xs font-bold">
            {repayments.length - i}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              Abono #{repayments.length - i}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDateShort(r.date)}{r.notes ? ` · ${r.notes}` : ""}
            </p>
          </div>
          <p className="text-sm font-semibold tabular-nums text-accent shrink-0">
            +{formatCents(r.amount, currency)}
          </p>
        </div>
      ))}
    </div>
  );
}
