"use client";

import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/money";
import { DEFAULT_ALERT_THRESHOLD } from "@/lib/constants";

// Tipo mínimo que BudgetRow necesita del item de presupuesto
interface BudgetRowItem {
  _id: string;
  amount: number;
  spent: number;
  alertThreshold?: number;
  currency: string;
  categoryName?: string;
  categoryColor?: string;
}

interface BudgetRowProps {
  budget: BudgetRowItem;
}

/** Fila de presupuesto individual: calcula pct/remaining/alertas y muestra barra de progreso. */
export function BudgetRow({ budget }: BudgetRowProps) {
  const pct = budget.amount > 0
    ? Math.min(100, (budget.spent / budget.amount) * 100)
    : 0;
  const remaining = budget.amount - budget.spent;
  const isOver = pct >= 100;
  const isWarning = !isOver && pct >= (budget.alertThreshold ?? DEFAULT_ALERT_THRESHOLD);

  return (
    <li className="px-4 py-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            {budget.categoryName ?? "Sin categoría"}
          </p>
          <p className="text-xs text-muted-foreground">
            {pct.toFixed(0)}% usado · {remaining < 0 ? "-" : ""}{formatCents(Math.abs(remaining), budget.currency)} restante
          </p>
        </div>
        <div className="text-right shrink-0">
          <p
            className={cn("text-sm font-bold", isOver ? "text-danger" : !isWarning ? "text-foreground" : undefined)}
            style={isWarning ? { color: "var(--warning-text)" } : undefined}
          >
            {formatCents(budget.spent, budget.currency)}
          </p>
          <p className="text-xs text-muted-foreground">de {formatCents(budget.amount, budget.currency)}</p>
        </div>
      </div>
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${budget.categoryName ?? "Presupuesto"}: ${Math.round(pct)}% gastado`}
        className="h-1.5 w-full rounded-full overflow-hidden"
        style={{ background: "var(--muted)" }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            backgroundColor: isOver ? "var(--danger)" : isWarning ? "var(--warning)" : (budget.categoryColor ?? "var(--accent)"),
          }}
        />
      </div>
    </li>
  );
}
