"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useState } from "react";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { BudgetCard } from "@/components/budgets/BudgetCard";
import { BudgetForm } from "@/components/budgets/BudgetForm";
import { currentMonth, formatMonth, formatCents } from "@/lib/money";
import { toast } from "sonner";

function shiftMonth(m: string, delta: number) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function PresupuestosPage() {
  const [month, setMonth] = useState(() => currentMonth());
  const [open, setOpen] = useState(false);

  const budgets = useQuery(api.budgets.listByMonthWithCategory, { month });
  const removeBudget = useMutation(api.budgets.remove);

  const totalBudgeted = (budgets ?? []).reduce((s, b) => s + b.amount, 0);
  const totalSpent    = (budgets ?? []).reduce((s, b) => s + b.spent, 0);
  const overBudget    = (budgets ?? []).filter((b) => b.spent > b.amount);

  async function handleDelete(budgetId: Id<"budgets">) {
    if (!confirm("¿Eliminar este presupuesto?")) return;
    try {
      await removeBudget({ budgetId });
      toast.success("Presupuesto eliminado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  }

  const isLoading = budgets === undefined;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Presupuestos</h1>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger render={<Button size="sm" className="gap-1.5" />}>
            <Plus className="h-4 w-4" /> Nuevo
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-xl">
            <SheetHeader className="pb-4">
              <SheetTitle>Nuevo presupuesto</SheetTitle>
            </SheetHeader>
            <BudgetForm defaultMonth={month} onSuccess={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>

      {/* Selector de mes */}
      <div className="flex items-center justify-between rounded-xl bg-card border border-border px-4 py-2">
        <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))}
          className="p-1 rounded hover:bg-muted transition-colors" aria-label="Mes anterior">
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        </button>
        <span className="text-sm font-medium capitalize">{formatMonth(month)}</span>
        <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))}
          disabled={month >= currentMonth()}
          className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-30" aria-label="Mes siguiente">
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Resumen del mes */}
      {!isLoading && (budgets ?? []).length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-card border border-border p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Presupuestado</p>
            <p className="text-sm font-bold text-foreground mt-0.5">{formatCents(totalBudgeted, "COP")}</p>
          </div>
          <div className="rounded-xl bg-card border border-border p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Gastado</p>
            <p className={`text-sm font-bold mt-0.5 ${totalSpent > totalBudgeted ? "text-danger" : "text-foreground"}`}>
              {formatCents(totalSpent, "COP")}
            </p>
          </div>
          <div className="rounded-xl bg-card border border-border p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Disponible</p>
            <p className={`text-sm font-bold mt-0.5 ${totalSpent > totalBudgeted ? "text-danger" : "text-accent"}`}>
              {formatCents(Math.max(0, totalBudgeted - totalSpent), "COP")}
            </p>
          </div>
        </div>
      )}

      {/* Alerta si hay excedidos */}
      {overBudget.length > 0 && (
        <div className="rounded-xl bg-danger/10 border border-danger/20 p-3">
          <p className="text-sm font-semibold text-danger">
            {overBudget.length} presupuesto{overBudget.length > 1 ? "s" : ""} excedido
            {overBudget.length > 1 ? "s" : ""}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {overBudget.map((b) => b.categoryName).join(", ")}
          </p>
        </div>
      )}

      {/* Lista de presupuestos */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : (budgets ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-14 text-center">
          <p className="text-sm text-muted-foreground">
            No hay presupuestos para {formatMonth(month).toLowerCase()}.
          </p>
          <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Crear presupuesto
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {budgets!
            .sort((a, b) => (b.spent / b.amount) - (a.spent / a.amount))
            .map((budget) => (
              <BudgetCard
                key={budget._id}
                budget={budget}
                onDelete={() => handleDelete(budget._id as Id<"budgets">)}
              />
            ))}
        </div>
      )}
    </div>
  );
}
