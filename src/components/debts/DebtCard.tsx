"use client";

import { formatCents } from "@/lib/money";
import { formatDateShort } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Doc } from "../../../convex/_generated/dataModel";

interface DebtCardProps {
  debt: Doc<"debts">;
  onClick?: () => void;
}

const TYPE_LABELS: Record<Doc<"debts">["type"], string> = {
  prestamo: "Préstamo",
  personal: "Personal",
  hipoteca: "Hipoteca",
  vehiculo: "Vehículo",
  otro: "Otro",
};

const STATUS_CONFIG = {
  activa:  { label: "Activa",  variant: "secondary" as const },
  pagada:  { label: "Pagada",  variant: "outline" as const },
  vencida: { label: "Vencida", variant: "destructive" as const },
};

export function DebtCard({ debt, onClick }: DebtCardProps) {
  const paidPercent = debt.originalAmount > 0
    ? Math.min(100, ((debt.originalAmount - debt.currentBalance) / debt.originalAmount) * 100)
    : 100;

  const status = STATUS_CONFIG[debt.status];

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
            style={{ backgroundColor: debt.color + "22", color: debt.color }}
          >
            {debt.name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-foreground truncate">{debt.name}</p>
            <p className="text-xs text-muted-foreground">
              {debt.creditor} · {TYPE_LABELS[debt.type]}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-muted-foreground">Saldo pendiente</p>
          <p className={cn(
            "font-bold tabular-nums",
            debt.status === "vencida" ? "text-danger" : "text-foreground"
          )}>
            {formatCents(debt.currentBalance, debt.currency)}
          </p>
          <Badge variant={status.variant} className="text-[10px] px-1.5 py-0 mt-0.5">
            {status.label}
          </Badge>
        </div>
      </div>

      {/* Barra de progreso */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Pagado: {paidPercent.toFixed(0)}%</span>
          <span>
            {formatCents(debt.originalAmount - debt.currentBalance, debt.currency)} de{" "}
            {formatCents(debt.originalAmount, debt.currency)}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              debt.status === "vencida" ? "bg-danger" : "bg-accent"
            )}
            style={{ width: `${paidPercent}%` }}
          />
        </div>
      </div>

      {/* Pie */}
      <div className="flex gap-4 text-xs text-muted-foreground border-t border-border pt-2">
        {debt.monthlyPayment && (
          <span>Cuota sugerida: {formatCents(debt.monthlyPayment, debt.currency)}</span>
        )}
        {debt.dueDate && (
          <span className={cn(debt.status === "vencida" && "text-danger font-medium")}>
            Vence: {formatDateShort(debt.dueDate)}
          </span>
        )}
        {debt.interestRate && (
          <span>Tasa: {(debt.interestRate * 100).toFixed(1)}% m.v.</span>
        )}
      </div>
    </button>
  );
}
