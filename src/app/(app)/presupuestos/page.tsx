"use client";

import { use, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../../convex/_generated/api";
import { PageContainer } from "@/components/layout/PageContainer";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BudgetDetailSheet } from "@/components/budgets/BudgetDetailSheet";
import { BudgetOverviewCard } from "@/components/budgets/BudgetOverviewCard";
import { BudgetRow } from "@/components/budgets/BudgetRow";
import { BudgetSheet } from "@/components/budgets/BudgetSheet";
import { EmptyState as BudgetsEmptyState } from "@/components/budgets/EmptyState";
import { MonthStepper } from "@/components/ui/month-stepper";
import { byUsage, stateOf, type Budget } from "@/components/budgets/shared";
import { AddFundsSheet } from "@/components/goals/AddFundsSheet";
import { EmptyState as GoalsEmptyState } from "@/components/goals/EmptyState";
import { GoalRow } from "@/components/goals/GoalRow";
import { GoalSheet } from "@/components/goals/GoalSheet";
import { GoalsOverviewCard } from "@/components/goals/GoalsOverviewCard";
import { byProgress, viewOf, type Goal } from "@/components/goals/shared";
import { EASE_OUT_EXPO, GLASS_SURFACE, SPRING, haptic } from "@/lib/ios";
import { currentMonth, formatMonth } from "@/lib/money";
import { cn } from "@/lib/utils";

type Tab = "presupuestos" | "metas";

const TABS: { key: Tab; label: string }[] = [
  { key: "presupuestos", label: "Presupuestos" },
  { key: "metas", label: "Metas" },
];

export default function PresupuestosPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = use(searchParams);
  const router = useRouter();
  const reduce = useReducedMotion();

  const [tab, setTab] = useState<Tab>(params.tab === "metas" ? "metas" : "presupuestos");
  const [month, setMonth] = useState(() => currentMonth());
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  // Se fija al montar: Date.now() en el render rompería la pureza del componente
  const [nowMs] = useState(() => Date.now());

  // ── Presupuestos ─────────────────────────────────────────────────────────
  const budgets = useQuery(api.budgets.listByMonthWithCategory, { month });
  const budgetsOverview = useQuery(api.budgets.overview, { month });
  const removeBudget = useMutation(api.budgets.remove);

  const [budgetSheet, setBudgetSheet] = useState<{ open: boolean; budget: Budget | null }>({ open: false, budget: null });
  const [detailBudget, setDetailBudget] = useState<Budget | null>(null);
  const [deletingBudget, setDeletingBudget] = useState<Budget | null>(null);

  const budgetGroups = useMemo(() => {
    const list = (budgets ?? []) as Budget[];
    return {
      over: list.filter((b) => stateOf(b) === "over").sort(byUsage),
      warn: list.filter((b) => stateOf(b) === "warn").sort(byUsage),
      ok: list.filter((b) => stateOf(b) === "ok").sort(byUsage),
    };
  }, [budgets]);

  // ── Metas ────────────────────────────────────────────────────────────────
  const goals = useQuery(api.goals.list);
  const goalsOverview = useQuery(api.goals.overview);
  const removeGoal = useMutation(api.goals.remove);
  const reactivateGoal = useMutation(api.goals.reactivate);

  const [goalSheet, setGoalSheet] = useState<{ open: boolean; goal: Goal | null }>({ open: false, goal: null });
  const [fundingGoal, setFundingGoal] = useState<Goal | null>(null);
  const [deletingGoal, setDeletingGoal] = useState<Goal | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const goalGroups = useMemo(() => {
    const list = (goals ?? []) as Goal[];
    return {
      active: list.filter((g) => !viewOf(g).completed).sort(byProgress),
      completed: list.filter((g) => viewOf(g).completed),
    };
  }, [goals]);

  const counts = {
    presupuestos: budgetGroups.over.length + budgetGroups.warn.length,
    metas: goalGroups.active.length,
  };

  function switchTab(next: Tab) {
    if (next === tab) return;
    haptic();
    setTab(next);
    setOpenRowId(null);
    setShowCompleted(false);
    // En la URL para que el enlace del dashboard y el botón atrás coincidan
    router.replace(next === "metas" ? "/presupuestos?tab=metas" : "/presupuestos", { scroll: false });
  }

  async function confirmDeleteBudget() {
    if (!deletingBudget) return;
    const name = deletingBudget.categoryName ?? "El presupuesto";
    try {
      await removeBudget({ budgetId: deletingBudget._id });
      setDeletingBudget(null);
      setDetailBudget(null);
      toast.success(`Presupuesto de «${name}» eliminado`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo eliminar");
    }
  }

  async function confirmDeleteGoal() {
    if (!deletingGoal) return;
    const name = deletingGoal.name;
    try {
      await removeGoal({ goalId: deletingGoal._id });
      setDeletingGoal(null);
      toast.success(`Meta «${name}» eliminada`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo eliminar");
    }
  }

  async function handleReactivate(goal: Goal) {
    haptic(15);
    try {
      await reactivateGoal({ goalId: goal._id });
      toast.success(`«${goal.name}» volvió a estar en progreso`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo reactivar");
    }
  }

  const isLoadingBudgets = budgets === undefined;
  const isLoadingGoals = goals === undefined;
  const budgetsTab = tab === "presupuestos";

  function onCreate() {
    haptic();
    if (budgetsTab) setBudgetSheet({ open: true, budget: null });
    else setGoalSheet({ open: true, goal: null });
  }

  let rowIndex = 0;
  function renderBudgets(list: Budget[]) {
    return (
      <div className={cn("rounded-[24px] p-1.5", GLASS_SURFACE)}>
        <ul className="space-y-0.5">
          <AnimatePresence initial={false}>
            {list.map((b) => (
              <BudgetRow
                key={b._id}
                budget={b}
                index={rowIndex++}
                openId={openRowId}
                setOpenId={setOpenRowId}
                onOpen={() => setDetailBudget(b)}
                onEdit={() => setBudgetSheet({ open: true, budget: b })}
                onDelete={() => setDeletingBudget(b)}
              />
            ))}
          </AnimatePresence>
        </ul>
      </div>
    );
  }

  let goalIndex = 0;
  function renderGoals(list: Goal[]) {
    return (
      <div className={cn("rounded-[24px] p-1.5", GLASS_SURFACE)}>
        <ul className="space-y-0.5">
          <AnimatePresence initial={false}>
            {list.map((g) => (
              <GoalRow
                key={g._id}
                goal={g}
                index={goalIndex++}
                nowMs={nowMs}
                openId={openRowId}
                setOpenId={setOpenRowId}
                onAddFunds={() => setFundingGoal(g)}
                onEdit={() => setGoalSheet({ open: true, goal: g })}
                onDelete={() => setDeletingGoal(g)}
                onReactivate={() => handleReactivate(g)}
              />
            ))}
          </AnimatePresence>
        </ul>
      </div>
    );
  }

  return (
    <PageContainer className="space-y-5">
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-foreground">
            Presupuestos y metas
          </h1>
          <p className="text-sm text-muted-foreground">
            {budgetsTab ? "Cuánto puedes gastar y cómo vas" : "Lo que estás ahorrando para lograrlo"}
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          aria-label={budgetsTab ? "Nuevo presupuesto" : "Nueva meta"}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-[0_8px_20px_-8px_rgb(16_185_129/0.9)] transition-transform active:scale-90"
        >
          <Plus className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
        </button>
      </header>

      {/* Pestañas con la píldora que se desliza */}
      <div className="sticky top-[calc(64px+env(safe-area-inset-top))] z-30 lg:top-4">
        <div
          role="tablist"
          aria-label="Presupuestos o metas"
          className={cn("flex rounded-[18px] p-1", GLASS_SURFACE, "md:bg-[color-mix(in_oklch,var(--card)_85%,transparent)] md:backdrop-blur-xl")}
        >
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`tab-${t.key}`}
                aria-selected={active}
                aria-controls="module-panel"
                onClick={() => switchTab(t.key)}
                className={cn(
                  "touch-hit relative flex flex-1 items-center justify-center gap-1.5 rounded-[14px] py-2 text-sm transition-colors",
                  active ? "font-bold text-foreground" : "font-semibold text-muted-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="module-tab-pill"
                    className="absolute inset-0 rounded-[14px] bg-[var(--surface)] shadow-[0_2px_10px_-4px_rgb(0_0_0/0.25)] dark:bg-white/10"
                    transition={SPRING}
                  />
                )}
                <span className="relative">{t.label}</span>
                {counts[t.key] > 0 && (
                  <span
                    className={cn(
                      "relative rounded-full px-1.5 text-[11px] font-bold tabular-nums",
                      active
                        ? t.key === "presupuestos"
                          ? "bg-[var(--os-orange)]/18 text-[var(--os-orange-text)]"
                          : "bg-[var(--os-lime)]/20 text-lime-text"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {counts[t.key]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div id="module-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="relative">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={tab}
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: budgetsTab ? -28 : 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: budgetsTab ? -28 : 28 }}
            transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
            className="space-y-5"
          >
            {budgetsTab ? (
              <>
                <MonthStepper month={month} onChange={(m) => { setMonth(m); setOpenRowId(null); }} />

                {isLoadingBudgets ? (
                  <div className="space-y-4">
                    <Skeleton className="h-[196px] rounded-[28px]" />
                    <div className={cn("space-y-1.5 rounded-[24px] p-2", GLASS_SURFACE)}>
                      {[1, 2, 3].map((i) => <Skeleton key={i} className="h-[74px] rounded-[18px]" />)}
                    </div>
                  </div>
                ) : (budgets ?? []).length === 0 ? (
                  <BudgetsEmptyState
                    month={formatMonth(month).toLowerCase()}
                    isCurrentMonth={month === currentMonth()}
                    onCreate={() => setBudgetSheet({ open: true, budget: null })}
                  />
                ) : (
                  <>
                    <BudgetOverviewCard data={budgetsOverview} month={month} nowMs={nowMs} />

                    {budgetGroups.over.length > 0 && (
                      <Group title="Excedidos" danger>{renderBudgets(budgetGroups.over)}</Group>
                    )}
                    {budgetGroups.warn.length > 0 && (
                      <Group title="En riesgo" warn>{renderBudgets(budgetGroups.warn)}</Group>
                    )}
                    {budgetGroups.ok.length > 0 && (
                      <Group title="Al día">{renderBudgets(budgetGroups.ok)}</Group>
                    )}

                    <p className="px-1 text-center text-xs text-muted-foreground/80">
                      Toca un presupuesto para ver en qué se fue. Desliza para editar o eliminar.
                    </p>
                  </>
                )}
              </>
            ) : (
              <>
                {isLoadingGoals ? (
                  <div className="space-y-4">
                    <Skeleton className="h-[152px] rounded-[28px]" />
                    <div className={cn("space-y-1.5 rounded-[24px] p-2", GLASS_SURFACE)}>
                      {[1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-[18px]" />)}
                    </div>
                  </div>
                ) : (goals ?? []).length === 0 ? (
                  <GoalsEmptyState onCreate={() => setGoalSheet({ open: true, goal: null })} />
                ) : (
                  <>
                    <GoalsOverviewCard data={goalsOverview} />

                    {goalGroups.active.length > 0 ? (
                      <Group title="En progreso">{renderGoals(goalGroups.active)}</Group>
                    ) : (
                      <p className={cn("rounded-[24px] px-6 py-6 text-center text-sm font-semibold text-foreground", GLASS_SURFACE)}>
                        Cumpliste todas tus metas 🎉
                      </p>
                    )}

                    {goalGroups.completed.length > 0 && (
                      <Collapsible
                        title="Cumplidas"
                        count={goalGroups.completed.length}
                        open={showCompleted}
                        onToggle={() => setShowCompleted((v) => !v)}
                      >
                        {renderGoals(goalGroups.completed)}
                      </Collapsible>
                    )}

                    <p className="px-1 text-center text-xs text-muted-foreground/80">
                      Toca una meta para abonar. Desliza para editarla o eliminarla.
                    </p>
                  </>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Hojas ────────────────────────────────────────────────────────── */}
      <BudgetSheet
        open={budgetSheet.open}
        onOpenChange={(open) => setBudgetSheet((s) => ({ ...s, open }))}
        budget={budgetSheet.budget}
        month={month}
      />

      <BudgetDetailSheet
        budget={detailBudget}
        open={detailBudget !== null}
        onOpenChange={(open) => { if (!open) setDetailBudget(null); }}
        nowMs={nowMs}
        onEdit={() => {
          const b = detailBudget;
          setDetailBudget(null);
          if (b) setBudgetSheet({ open: true, budget: b });
        }}
        onDeleted={() => setDetailBudget(null)}
      />

      <GoalSheet
        open={goalSheet.open}
        onOpenChange={(open) => setGoalSheet((s) => ({ ...s, open }))}
        goal={goalSheet.goal}
      />

      <AddFundsSheet
        goal={fundingGoal}
        open={fundingGoal !== null}
        onOpenChange={(open) => { if (!open) setFundingGoal(null); }}
      />

      {/* ── Confirmaciones de borrado ────────────────────────────────────── */}
      <AlertDialog open={deletingBudget !== null} onOpenChange={(open) => { if (!open) setDeletingBudget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Eliminar el presupuesto de «{deletingBudget?.categoryName ?? "esta categoría"}»
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se borra solo el límite del mes: tus movimientos de la categoría no se tocan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction onClick={confirmDeleteBudget}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deletingGoal !== null} onOpenChange={(open) => { if (!open) setDeletingGoal(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar «{deletingGoal?.name}»</AlertDialogTitle>
            <AlertDialogDescription>
              Se perderá el progreso acumulado de la meta. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction onClick={confirmDeleteGoal}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}

// ─── Piezas de la lista ───────────────────────────────────────────────────────

function Group({
  title,
  danger,
  warn,
  children,
}: {
  title: string;
  danger?: boolean;
  warn?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2" aria-label={title}>
      <h2
        className="px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground"
        style={danger ? { color: "var(--os-magenta)" } : warn ? { color: "var(--os-orange-text)" } : undefined}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Collapsible({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-1 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground pointer-coarse:min-h-11"
      >
        <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.2 }} className="flex">
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </motion.span>
        {title}
        <span className="rounded-full bg-muted px-1.5 text-[11px] font-bold tabular-nums">{count}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
