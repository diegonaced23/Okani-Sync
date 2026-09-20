"use client";

import { memo, useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { GLASS_SURFACE } from "@/lib/ios";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Plus } from "lucide-react";
import { BudgetRow } from "./BudgetRow";

// Tipo mínimo compatible con el retorno de api.budgets.listByMonthWithCategory
interface BudgetItem {
  _id: string;
  amount: number;
  spent: number;
  alertThreshold?: number;
  currency: string;
  categoryName?: string;
  categoryColor?: string;
}

interface BudgetsMiniListProps {
  /** undefined = cargando; [] = sin presupuestos este mes */
  budgets: BudgetItem[] | undefined;
}

/** Top-5 presupuestos del mes ordenados por porcentaje gastado (mayor primero). */
export const BudgetsMiniList = memo(function BudgetsMiniList({ budgets }: BudgetsMiniListProps) {
  // Spread para evitar mutar el array original de Convex
  const top5 = useMemo(
    () =>
      budgets === undefined
        ? []
        : [...budgets]
            .sort(
              (a, b) =>
                (b.amount > 0 ? b.spent / b.amount : 0) - (a.amount > 0 ? a.spent / a.amount : 0)
            )
            .slice(0, 5),
    [budgets]
  );

  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-foreground">Presupuestos</h2>
        <Link
          href="/presupuestos"
          className="touch-hit text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          Ver todos
        </Link>
      </div>
      <div className={cn("rounded-[22px] p-1.5", GLASS_SURFACE)}>
        {budgets === undefined ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-[16px]" />)}
          </div>
        ) : budgets.length === 0 ? (
          // Estado vacío con CTA directo para que el usuario no quede en un callejón sin salida
          <div className="flex flex-col items-center gap-3 py-8">
            <p className="text-sm text-muted-foreground text-center">
              Sin presupuestos este mes.
            </p>
            <Link
              href="/presupuestos"
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-foreground border border-border bg-card hover:bg-muted/60 transition-colors"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              Crear presupuesto
            </Link>
          </div>
        ) : (
          <ul className="os-enter space-y-0.5">
            {top5.map((budget) => (
              <BudgetRow key={budget._id} budget={budget} />
            ))}
          </ul>
        )}
      </div>

      {/* Se muestran los 5 más gastados: sin esto, con doce presupuestos siete
          desaparecían sin que nada lo indicara. */}
      {budgets !== undefined && budgets.length > top5.length && (
        <Link
          href="/presupuestos"
          className="block px-1 text-center text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          Ver los {budgets.length - top5.length} presupuestos restantes
        </Link>
      )}
    </section>
  );
});
