"use client";

import { Suspense } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id, Doc } from "../../../../convex/_generated/dataModel";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppSheet } from "@/components/ui/app-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { PillTabs } from "@/components/ui/pill-tabs";
import { BudgetCard } from "@/components/budgets/BudgetCard";
import { BudgetForm } from "@/components/budgets/BudgetForm";
import { GoalCard } from "@/components/goals/GoalCard";
import { GoalForm } from "@/components/goals/GoalForm";
import { AddFundsForm } from "@/components/goals/AddFundsForm";
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

// ─── Tipos ────────────────────────────────────────────────────────────────────

type PageTab = "presupuestos" | "metas";

const TABS: { key: PageTab; label: string }[] = [
  { key: "presupuestos", label: "Presupuestos" },
  { key: "metas",        label: "Metas" },
];

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

// ─── Utilidades ───────────────────────────────────────────────────────────────

function shiftMonth(m: string, delta: number) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Contenido principal (necesita Suspense por useSearchParams) ───────────────

function PresupuestosContent() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as PageTab) ?? "presupuestos";

  // Un único useState para evitar hydration mismatch con useSearchParams
  const [activeTab, setActiveTab] = useState<PageTab>(initialTab);

  // ── Estado presupuestos ──────────────────────────────────────────────────
  const [month, setMonth]               = useState(() => currentMonth());
  const [createBudgetOpen, setCreateBudgetOpen] = useState(false);
  const [editingBudget, setEditingBudget]       = useState<BudgetWithCategory | null>(null);
  const [deletingBudgetId, setDeletingBudgetId] = useState<Id<"budgets"> | null>(null);

  const budgets     = useQuery(api.budgets.listByMonthWithCategory, { month });
  const removeBudget = useMutation(api.budgets.remove);

  const totalBudgeted = (budgets ?? []).reduce((s, b) => s + b.amount, 0);
  const totalSpent    = (budgets ?? []).reduce((s, b) => s + b.spent, 0);
  const overBudget    = (budgets ?? []).filter((b) => b.spent > b.amount);

  async function executeDeleteBudget() {
    if (!deletingBudgetId) return;
    try {
      await removeBudget({ budgetId: deletingBudgetId });
      toast.success("Presupuesto eliminado");
      setDeletingBudgetId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  }

  // ── Estado metas ─────────────────────────────────────────────────────────
  // nowMs se calcula una vez al montar para evitar el error de purity
  const [nowMs] = useState<number>(() => Date.now());

  const [createGoalOpen, setCreateGoalOpen]     = useState(false);
  const [editingGoal, setEditingGoal]           = useState<Doc<"goals"> | null>(null);
  const [addFundsGoal, setAddFundsGoal]         = useState<Doc<"goals"> | null>(null);
  const [deletingGoalId, setDeletingGoalId]     = useState<Id<"goals"> | null>(null);

  const goals       = useQuery(api.goals.list);
  const removeGoal  = useMutation(api.goals.remove);

  const activeGoals    = (goals ?? []).filter((g) => g.status === "activa");
  const completedGoals = (goals ?? []).filter((g) => g.status === "completada");

  async function executeDeleteGoal() {
    if (!deletingGoalId) return;
    try {
      await removeGoal({ goalId: deletingGoalId });
      toast.success("Meta eliminada");
      setDeletingGoalId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  }

  const isLoadingBudgets = budgets === undefined;
  const isLoadingGoals   = goals === undefined;

  return (
    <div className="space-y-5 max-w-2xl mx-auto">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Presupuestos y metas</h1>

        {/* Botón desktop — cambia según tab */}
        {activeTab === "presupuestos" ? (
          <Button
            size="sm"
            onClick={() => setCreateBudgetOpen(true)}
            className="hidden md:flex gap-1.5 bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-500 hover:to-teal-600 text-white border-0 shadow-md"
          >
            <Plus className="h-4 w-4" /> Nuevo presupuesto
          </Button>
        ) : (
          <AppSheet
            open={createGoalOpen}
            onOpenChange={setCreateGoalOpen}
            title="Nueva meta"
            trigger={
              <Button
                size="sm"
                className="hidden md:flex gap-1.5 bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-500 hover:to-teal-600 text-white border-0 shadow-md"
              >
                <Plus className="h-4 w-4" /> Nueva meta
              </Button>
            }
          >
            <GoalForm onSuccess={() => setCreateGoalOpen(false)} />
          </AppSheet>
        )}
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <PillTabs
        tabs={TABS}
        active={activeTab}
        onChange={setActiveTab}
        ariaLabel="Seleccionar sección"
      />

      {/* ══════════════════════════════════════════════════════════════════
          TAB: PRESUPUESTOS
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "presupuestos" && (
        <div
          className="space-y-5"
          role="tabpanel"
          id="panel-presupuestos"
          aria-labelledby="tab-presupuestos"
        >
          {/* Sheet crear presupuesto */}
          <AppSheet
            open={createBudgetOpen}
            onOpenChange={setCreateBudgetOpen}
            title="Nuevo presupuesto"
          >
            <BudgetForm defaultMonth={month} onSuccess={() => setCreateBudgetOpen(false)} />
          </AppSheet>

          {/* Sheet editar presupuesto */}
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
          {!isLoadingBudgets && (budgets ?? []).length > 0 && (
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

          {/* Alerta excedidos */}
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
          {isLoadingBudgets ? (
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
                    onDelete={() => setDeletingBudgetId(budget._id as Id<"budgets">)}
                  />
                ))}
            </div>
          )}

          {/* Botón mobile */}
          {!isLoadingBudgets && (
            <div className="md:hidden">
              <Button
                onClick={() => setCreateBudgetOpen(true)}
                className="w-full gap-2 bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-500 hover:to-teal-600 text-white border-0 shadow-lg rounded-xl h-12 text-base font-semibold"
              >
                <Plus className="h-5 w-5" /> Agregar presupuesto
              </Button>
            </div>
          )}

          {/* Diálogo eliminar presupuesto */}
          <AlertDialog open={deletingBudgetId !== null} onOpenChange={(open) => { if (!open) setDeletingBudgetId(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Eliminar presupuesto</AlertDialogTitle>
                <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel />
                <AlertDialogAction onClick={executeDeleteBudget}>Eliminar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: METAS
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "metas" && (
        <div
          className="space-y-5"
          role="tabpanel"
          id="panel-metas"
          aria-labelledby="tab-metas"
        >
          {/* Sheets de metas */}
          <AppSheet
            open={!!editingGoal}
            onOpenChange={(open) => { if (!open) setEditingGoal(null); }}
            title="Editar meta"
          >
            {editingGoal && (
              <GoalForm
                editGoal={editingGoal}
                onSuccess={() => setEditingGoal(null)}
              />
            )}
          </AppSheet>

          <AppSheet
            open={!!addFundsGoal}
            onOpenChange={(open) => { if (!open) setAddFundsGoal(null); }}
            title="Abonar a la meta"
          >
            {addFundsGoal && (
              <AddFundsForm
                goal={addFundsGoal}
                onSuccess={() => setAddFundsGoal(null)}
              />
            )}
          </AppSheet>

          {/* Stats rápidas */}
          {!isLoadingGoals && (goals ?? []).length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-card border border-border p-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">En progreso</p>
                <p className="text-2xl font-bold text-foreground mt-0.5">{activeGoals.length}</p>
              </div>
              <div className="rounded-xl bg-card border border-border p-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Completadas</p>
                <p className="text-2xl font-bold mt-0.5" style={{ color: "var(--os-lime)" }}>
                  {completedGoals.length}
                </p>
              </div>
            </div>
          )}

          {/* Lista de metas activas */}
          {isLoadingGoals ? (
            <div className="space-y-3">
              {[1, 2].map((i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
            </div>
          ) : (goals ?? []).length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <p className="text-4xl">🎯</p>
              <p className="text-sm font-medium text-foreground">Aún no tienes metas</p>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                Define tus objetivos financieros: la laptop, el viaje o el fondo de emergencia que tanto quieres lograr.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeGoals.length > 0 && (
                <section className="space-y-3">
                  {activeGoals.length < (goals ?? []).length && (
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      En progreso
                    </h2>
                  )}
                  {activeGoals.map((goal) => (
                    <GoalCard
                      key={goal._id}
                      goal={goal}
                      nowMs={nowMs}
                      onEdit={() => setEditingGoal(goal)}
                      onDelete={() => setDeletingGoalId(goal._id as Id<"goals">)}
                      onAddFunds={() => setAddFundsGoal(goal)}
                    />
                  ))}
                </section>
              )}

              {completedGoals.length > 0 && (
                <section className="space-y-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Completadas
                  </h2>
                  {completedGoals.map((goal) => (
                    <GoalCard
                      key={goal._id}
                      goal={goal}
                      nowMs={nowMs}
                      onEdit={() => setEditingGoal(goal)}
                      onDelete={() => setDeletingGoalId(goal._id as Id<"goals">)}
                      onAddFunds={() => setAddFundsGoal(goal)}
                    />
                  ))}
                </section>
              )}
            </div>
          )}

          {/* Botón mobile */}
          {!isLoadingGoals && (
            <div className="md:hidden">
              <AppSheet
                open={createGoalOpen}
                onOpenChange={setCreateGoalOpen}
                title="Nueva meta"
                trigger={
                  <Button className="w-full gap-2 bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-500 hover:to-teal-600 text-white border-0 shadow-lg rounded-xl h-12 text-base font-semibold">
                    <Plus className="h-5 w-5" /> Crear meta
                  </Button>
                }
              >
                <GoalForm onSuccess={() => setCreateGoalOpen(false)} />
              </AppSheet>
            </div>
          )}

          {/* Diálogo eliminar meta */}
          <AlertDialog open={deletingGoalId !== null} onOpenChange={(open) => { if (!open) setDeletingGoalId(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Eliminar meta</AlertDialogTitle>
                <AlertDialogDescription>
                  Se perderá el progreso acumulado. Esta acción no se puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel />
                <AlertDialogAction onClick={executeDeleteGoal}>Eliminar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}

// ─── Page wrapper con Suspense (requerido por useSearchParams) ────────────────

export default function PresupuestosPage() {
  return (
    <Suspense>
      <PresupuestosContent />
    </Suspense>
  );
}
