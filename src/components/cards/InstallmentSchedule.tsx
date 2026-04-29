"use client";

import { formatCents } from "@/lib/money";
import { formatDateShort } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Check, Clock } from "lucide-react";
import type { Doc } from "../../../convex/_generated/dataModel";

interface InstallmentScheduleProps {
  installments: Doc<"cardInstallments">[];
  currency: string;
  onPay?: (installmentId: Doc<"cardInstallments">["_id"]) => void;
  paying?: string; // installmentId being paid
}

export function InstallmentSchedule({
  installments,
  currency,
  onPay,
  paying,
}: InstallmentScheduleProps) {
  const sorted = [...installments].sort(
    (a, b) => a.installmentNumber - b.installmentNumber
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b border-border">
            <th className="pb-2 font-medium text-muted-foreground text-xs w-8">#</th>
            <th className="pb-2 font-medium text-muted-foreground text-xs">Vence</th>
            <th className="pb-2 font-medium text-muted-foreground text-xs text-right">Capital</th>
            <th className="pb-2 font-medium text-muted-foreground text-xs text-right">Interés</th>
            <th className="pb-2 font-medium text-muted-foreground text-xs text-right">Cuota</th>
            <th className="pb-2 w-10" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map((inst) => (
            <tr
              key={inst._id}
              className={cn(
                "transition-colors",
                inst.paid ? "opacity-50" : "hover:bg-muted/30"
              )}
            >
              <td className="py-2.5 text-xs text-muted-foreground">{inst.installmentNumber}</td>
              <td className="py-2.5 text-xs">{formatDateShort(inst.dueDate)}</td>
              <td className="py-2.5 text-xs text-right tabular-nums text-accent">
                {formatCents(inst.principalAmount ?? 0, currency)}
              </td>
              <td className="py-2.5 text-xs text-right tabular-nums text-warning">
                {formatCents(inst.interestAmount ?? 0, currency)}
              </td>
              <td className="py-2.5 text-xs text-right tabular-nums font-semibold">
                {formatCents(inst.amount, currency)}
              </td>
              <td className="py-2.5">
                {inst.paid ? (
                  <Check className="h-4 w-4 text-accent mx-auto" />
                ) : onPay ? (
                  <button
                    type="button"
                    onClick={() => onPay(inst._id)}
                    disabled={paying === inst._id}
                    className="flex h-6 w-6 items-center justify-center rounded-full border border-border hover:bg-accent hover:text-accent-foreground hover:border-accent transition-colors mx-auto disabled:opacity-50"
                    aria-label="Pagar cuota"
                  >
                    {paying === inst._id ? (
                      <Clock className="h-3 w-3 animate-spin" />
                    ) : (
                      <span className="text-[10px] font-bold">$</span>
                    )}
                  </button>
                ) : (
                  <Clock className="h-4 w-4 text-muted-foreground mx-auto" />
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-border">
          <tr>
            <td colSpan={2} className="pt-2 text-xs text-muted-foreground">Total</td>
            <td className="pt-2 text-xs text-right tabular-nums text-accent font-medium">
              {formatCents(
                sorted.reduce((s, i) => s + (i.principalAmount ?? 0), 0),
                currency
              )}
            </td>
            <td className="pt-2 text-xs text-right tabular-nums text-warning font-medium">
              {formatCents(
                sorted.reduce((s, i) => s + (i.interestAmount ?? 0), 0),
                currency
              )}
            </td>
            <td className="pt-2 text-xs text-right tabular-nums font-bold">
              {formatCents(sorted.reduce((s, i) => s + i.amount, 0), currency)}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
