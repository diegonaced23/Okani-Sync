"use client";

import { formatCents } from "@/lib/money";
import { formatDateShort } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Doc } from "../../../convex/_generated/dataModel";

interface LoanCardProps {
  loan: Doc<"loans">;
  onClick?: () => void;
}

const STATUS_CONFIG = {
  activa:  { label: "Activo",   variant: "secondary" as const },
  pagada:  { label: "Cobrado",  variant: "outline" as const },
  vencida: { label: "Vencido",  variant: "destructive" as const },
};

export function LoanCard({ loan, onClick }: LoanCardProps) {
  const collectedPercent = loan.originalAmount > 0
    ? Math.min(100, ((loan.originalAmount - loan.currentBalance) / loan.originalAmount) * 100)
    : 100;

  const status = STATUS_CONFIG[loan.status];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-xl border border-border bg-card p-4 space-y-3",
        "transition-colors hover:bg-muted/50 active:scale-[0.99]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-bold"
            style={{ backgroundColor: loan.color + "22", color: loan.color }}
          >
            {loan.borrower.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-foreground truncate">{loan.name}</p>
            <p className="text-xs text-muted-foreground">
              A: {loan.borrower}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-muted-foreground">Pendiente de cobro</p>
          <p className={cn(
            "font-bold tabular-nums",
            loan.status === "vencida" ? "text-danger" : "text-foreground"
          )}>
            {formatCents(loan.currentBalance, loan.currency)}
          </p>
          <Badge variant={status.variant} className="text-[10px] px-1.5 py-0 mt-0.5">
            {status.label}
          </Badge>
        </div>
      </div>

      {/* Barra de progreso */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Cobrado: {collectedPercent.toFixed(0)}%</span>
          <span>
            {formatCents(loan.originalAmount - loan.currentBalance, loan.currency)} de{" "}
            {formatCents(loan.originalAmount, loan.currency)}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              loan.status === "vencida" ? "bg-danger" : "bg-accent"
            )}
            style={{ width: `${collectedPercent}%` }}
          />
        </div>
      </div>

      {/* Pie */}
      {(loan.dueDate || loan.archived) && (
        <div className="flex gap-4 text-xs text-muted-foreground border-t border-border pt-2">
          {loan.dueDate && (
            <span className={cn(loan.status === "vencida" && "text-danger font-medium")}>
              Vence: {formatDateShort(loan.dueDate)}
            </span>
          )}
          {loan.archived && (
            <span className="text-muted-foreground">Archivado</span>
          )}
        </div>
      )}
    </button>
  );
}
