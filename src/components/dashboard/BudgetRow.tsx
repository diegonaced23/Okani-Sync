"use client";

import { memo } from "react";
import { CategoryIcon } from "@/components/ui/category-icon";
import { useBalanceHidden } from "@/hooks/use-balance-hidden";
import { DEFAULT_ALERT_THRESHOLD } from "@/lib/constants";
import { tint } from "@/lib/ios";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

// Tipo mínimo que BudgetRow necesita del item de presupuesto
interface BudgetRowItem {
  _id: string;
  amount: number;
  spent: number;
  alertThreshold?: number;
  currency: string;
  categoryName?: string;
  categoryColor?: string;
  categoryIcon?: string;
}

const MASK = "$ ••••";

/**
 * Fila de presupuesto del dashboard.
 *
 * El porcentaje que se imprime es el real y el que llena la barra va topado: antes
 * ambos salían del mismo valor topado en 100, así que un presupuesto gastado al 320%
 * decía «100% usado». Y el sobregasto ya no se anuncia solo con el color rojo: lleva
 * su propia etiqueta, porque el color por sí solo no es una señal accesible.
 */
export const BudgetRow = memo(function BudgetRow({ budget }: { budget: BudgetRowItem }) {
  const [hidden] = useBalanceHidden();

  const pctRaw = budget.amount > 0 ? (budget.spent / budget.amount) * 100 : 0;
  const pctBar = Math.min(100, pctRaw);
  const remaining = budget.amount - budget.spent;
  const isOver = pctRaw > 100;
  const isWarning = !isOver && pctRaw >= (budget.alertThreshold ?? DEFAULT_ALERT_THRESHOLD);

  const tone = isOver ? "var(--os-magenta)" : isWarning ? "var(--os-orange)" : budget.categoryColor ?? "var(--os-lime)";
  const textTone = isOver
    ? "var(--os-magenta)"
    : isWarning
      ? "var(--os-orange-text)"
      : undefined;

  const money = (cents: number) => (hidden ? MASK : formatCents(cents, budget.currency));

  return (
    <li className="space-y-2 rounded-[16px] px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {/* El icono de la categoría llegaba en la query y no se pintaba: era la
              única fila de presupuesto de la app sin él. */}
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px]"
            style={{
              background: tint(budget.categoryColor ?? "var(--os-lime)", 16),
              color: budget.categoryColor ?? "var(--os-lime)",
            }}
          >
            <CategoryIcon name={budget.categoryIcon ?? "tag"} className="h-4 w-4" />
          </span>

          <div className="min-w-0">
            <p className="flex items-center gap-1.5">
              <span className="truncate text-[14px] font-semibold text-foreground">
                {budget.categoryName ?? "Sin categoría"}
              </span>
              {isOver && (
                <span
                  className="shrink-0 rounded-full px-1.5 py-px text-[10px] font-bold"
                  style={{ background: tint("var(--os-magenta)", 15), color: "var(--os-magenta)" }}
                >
                  Excedido
                </span>
              )}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {/* El porcentaje real, sin topar */}
              {Math.round(pctRaw)}% usado ·{" "}
              {remaining < 0
                ? `${money(-remaining)} de más`
                : `${money(remaining)} disponibles`}
            </p>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="font-mono-num text-sm font-bold tabular-nums" style={{ color: textTone }}>
            {money(budget.spent)}
          </p>
          <p className="font-mono-num text-xs tabular-nums text-muted-foreground">
            de {money(budget.amount)}
          </p>
        </div>
      </div>

      <div
        role="progressbar"
        // El valor accesible es el real, aunque la barra se quede en el tope
        aria-valuenow={Math.round(pctRaw)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${budget.categoryName ?? "Presupuesto"}: ${Math.round(pctRaw)}% gastado${isOver ? ", excedido" : ""}`}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("bar-fill h-full rounded-full")}
          style={{ width: `${pctBar}%`, backgroundColor: tone }}
        />
      </div>
    </li>
  );
});
