"use client";

import { Skeleton } from "@/components/ui/skeleton";
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
export function BudgetsMiniList({ budgets }: BudgetsMiniListProps) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-foreground">Presupuestos</h2>
        <Link
          href="/presupuestos"
          className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          Ver todos
        </Link>
      </div>
      <div className="rounded-xl bg-card border border-border overflow-hidden">
        {budgets === undefined ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
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
          <ul className="divide-y divide-border">
            {/* Spread para evitar mutar el array original de Convex */}
            {[...budgets]
              .sort((a, b) => (b.spent / b.amount) - (a.spent / a.amount))
              .slice(0, 5)
              .map((budget) => (
                <BudgetRow key={budget._id} budget={budget} />
              ))}
          </ul>
        )}
      </div>
    </section>
  );
}
