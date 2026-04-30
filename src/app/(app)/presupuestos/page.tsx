"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useState } from "react";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppSheet } from "@/components/ui/app-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { BudgetCard } from "@/components/budgets/BudgetCard";
import { BudgetForm } from "@/components/budgets/BudgetForm";
import { currentMonth, formatMonth, formatCents } from "@/lib/money";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

function shiftMonth(m: string, delta: number) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type BudgetWithCategory = {
  _id: string;
  categoryId: string;
  categoryName?: string;
  categoryColor?: string;
  amount: number;
  spent: number;
  currency: string;
  alertThreshold?: number;
  recurring?: boolean;
};

export default function PresupuestosPage() {
  const [month, setMonth] = useState(() => currentMonth());
  const [createOpen, setCreateOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetWithCategory | null>(null);
  const [deletingBudgetId, setDeletingBudgetId] = useState<Id<"budgets"> | null>(null);

  const budgets = useQuery(api.budgets.listByMonthWithCategory, { month });
  const removeBudget = useMutation(api.budgets.remove);

  const totalBudgeted = (budgets ?? []).reduce((s, b) => s + b.amount, 0);
  const totalSpent    = (budgets ?? []).reduce((s, b) => s + b.spent, 0);
  const overBudget    = (budgets ?? []).filter((b) => b.spent > b.amount);

  function handleDelete(budgetId: Id<"budgets">) {
    setDeletingBudgetId(budgetId);
  }

  async function executeDelete() {
    if (!deletingBudgetId) return;
    try {
      await removeBudget({ budgetId: deletingBudgetId });
      toast.success("Presupuesto eliminado");
      setDeletingBudgetId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  }

  const isLoading = budgets === undefined;

  const createSheet = (
    <AppSheet
      open={createOpen}
      onOpenChange={setCreateOpen}
      title="Nuevo presupuesto"
    >
      <BudgetForm defaultMonth={month} onSuccess={() => setCreateOpen(false)} />
    </AppSheet>
  );

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Presupuestos</h1>
        <Button
          size="sm"
          onClick={() => setCreateOpen(true)}
          className="hidden md:flex gap-1.5 bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-500 hover:to-teal-600 text-white border-0 shadow-md"
        >
          <Plus className="h-4 w-4" /> Nuevo presupuesto
        </Button>
      </div>

      {createSheet}

      {/* Sheet de edición */}
      <AppSheet
        open={!!editingBudget}
        onOpenChange={(open) => { if (!open) setEditingBudget(null); }}
        title="Editar presupuesto"
      >
        {editingBudget && (
          <BudgetForm
            editBudget={editingBudget}
            onSuccess={() => setEditingBudget(null)}
          />
        )}
      </AppSheet>

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
        <p className="text-sm text-muted-foreground py-14 text-center">
          No hay presupuestos para {formatMonth(month).toLowerCase()}.
        </p>
      ) : (
        <div className="space-y-3">
          {budgets!
            .sort((a, b) => (b.spent / b.amount) - (a.spent / a.amount))
            .map((budget) => (
              <BudgetCard
                key={budget._id}
                budget={budget}
                onEdit={() => setEditingBudget(budget as BudgetWithCategory)}
                onDelete={() => handleDelete(budget._id as Id<"budgets">)}
              />
            ))}
        </div>
      )}

      {/* Botón mobile */}
      {!isLoading && (
        <div className="md:hidden">
          <Button
            onClick={() => setCreateOpen(true)}
            className="w-full gap-2 bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-500 hover:to-teal-600 text-white border-0 shadow-lg rounded-xl h-12 text-base font-semibold"
          >
            <Plus className="h-5 w-5" /> Agregar presupuesto
          </Button>
        </div>
      )}

      <AlertDialog open={deletingBudgetId !== null} onOpenChange={(open) => { if (!open) setDeletingBudgetId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar presupuesto</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction onClick={executeDelete}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
