"use client";

import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Trash2, Pencil, RefreshCw } from "lucide-react";

interface BudgetCardProps {
  budget: {
    _id: string;
    amount: number;
    spent: number;
    currency: string;
    alertThreshold?: number;
    categoryName?: string;
    categoryColor?: string;
    recurring?: boolean;
  };
  onEdit?: () => void;
  onDelete?: () => void;
}

export function BudgetCard({ budget, onEdit, onDelete }: BudgetCardProps) {
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
          {budget.recurring && (
            <span className="flex items-center gap-0.5 text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full shrink-0">
              <RefreshCw className="h-2.5 w-2.5" />
              Recurrente
            </span>
          )}
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
        <div className="flex items-center gap-1 shrink-0">
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Editar presupuesto"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-danger transition-colors"
              aria-label="Eliminar presupuesto"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Barra de progreso */}
      <div className="space-y-1.5">
        <div
          role="progressbar"
          aria-valuenow={Math.round(percent)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${budget.categoryName ?? "Presupuesto"}: ${Math.round(percent)}% gastado`}
          className="h-2 w-full rounded-full bg-muted overflow-hidden"
        >
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
