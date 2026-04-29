"use client";

import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";

interface BudgetCardProps {
  budget: {
    _id: string;
    amount: number;
    spent: number;
    currency: string;
    alertThreshold?: number;
    categoryName?: string;
    categoryColor?: string;
  };
  onDelete?: () => void;
}

export function BudgetCard({ budget, onDelete }: BudgetCardProps) {
  const threshold = budget.alertThreshold ?? 80;
  const percent = budget.amount > 0
    ? Math.min(100, (budget.spent / budget.amount) * 100)
    : 0;
  const remaining = Math.max(0, budget.amount - budget.spent);
  const isOver = percent >= 100;
  const isWarning = !isOver && percent >= threshold;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="h-3 w-3 rounded-full shrink-0"
            style={{ backgroundColor: budget.categoryColor ?? "#6B7280" }}
          />
          <p className="font-medium text-foreground truncate">
            {budget.categoryName ?? "Sin categoría"}
          </p>
          {isOver && (
            <span className="text-[10px] font-semibold text-danger bg-danger/10 px-1.5 py-0.5 rounded-full shrink-0">
              Excedido
            </span>
          )}
          {isWarning && (
            <span className="text-[10px] font-semibold text-warning bg-warning/10 px-1.5 py-0.5 rounded-full shrink-0">
              {percent.toFixed(0)}%
            </span>
          )}
        </div>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-danger transition-colors shrink-0"
            aria-label="Eliminar presupuesto"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Barra de progreso */}
      <div className="space-y-1.5">
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              isOver ? "bg-danger" : isWarning ? "bg-warning" : "bg-accent"
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            Gastado: <span className={cn("font-medium",
              isOver ? "text-danger" : isWarning ? "text-warning" : "text-foreground"
            )}>
              {formatCents(budget.spent, budget.currency)}
            </span>
          </span>
          <span>
            Disponible: <span className="font-medium text-foreground">
              {formatCents(remaining, budget.currency)}
            </span>
          </span>
        </div>
      </div>

      {/* Presupuesto total */}
      <p className="text-xs text-muted-foreground text-right border-t border-border pt-2">
        Presupuesto: {formatCents(budget.amount, budget.currency)}
      </p>
    </div>
  );
}
