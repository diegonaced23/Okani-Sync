"use client";

import { memo, useMemo } from "react";
import Link from "next/link";
import { Plus, Target } from "lucide-react";
import { formatCents } from "@/lib/money";
import { Skeleton } from "@/components/ui/skeleton";

// Tipo mínimo compatible con el retorno de api.goals.list
interface GoalItem {
  _id: string;
  name: string;
  icon: string;
  color: string;
  targetAmount: number;
  currentAmount: number;
  currency: string;
  status: "activa" | "completada";
  deadline?: number;
  linkedAccount?: { name: string; balance: number; currency: string; color: string };
}

interface GoalsMiniListProps {
  /** undefined = cargando; [] = sin metas */
  goals: GoalItem[] | undefined;
}

const MAX_VISIBLE = 3;
const MS_PER_DAY = 86_400_000;
// Capturado al cargar el módulo — Date.now() en render es impuro para el React Compiler
const SESSION_NOW = Date.now();

/**
 * Progreso real de una meta. Si está vinculada a una cuenta, el avance es el
 * saldo de esa cuenta; si no, el acumulado manual (`currentAmount`).
 * Ver "Préstamos, metas y patrimonio neto" en CLAUDE.md.
 */
function progressOf(goal: GoalItem): number {
  return goal.linkedAccount ? goal.linkedAccount.balance : goal.currentAmount;
}

function deadlineLabel(deadline: number): { text: string; overdue: boolean } | null {
  const days = Math.ceil((deadline - SESSION_NOW) / MS_PER_DAY);
  if (days < 0) return { text: "Fecha vencida", overdue: true };
  if (days === 0) return { text: "Vence hoy", overdue: true };
  if (days <= 30) return { text: `${days} día${days !== 1 ? "s" : ""}`, overdue: false };
  const months = Math.round(days / 30);
  return { text: `${months} mes${months !== 1 ? "es" : ""}`, overdue: false };
}

function GoalRow({ goal }: { goal: GoalItem }) {
  const current = progressOf(goal);
  const pct = goal.targetAmount > 0
    ? Math.min(100, Math.round((current / goal.targetAmount) * 100))
    : 0;
  const remaining = Math.max(0, goal.targetAmount - current);
  const due = goal.deadline !== undefined ? deadlineLabel(goal.deadline) : null;

  return (
    <li className="px-4 py-3 space-y-2">
      <div className="flex items-center gap-3 min-w-0">
        <span
          aria-hidden="true"
          className="flex items-center justify-center shrink-0 text-base"
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            background: `color-mix(in oklch, ${goal.color} 15%, var(--card))`,
          }}
        >
          {goal.icon}
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{goal.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {remaining > 0 ? (
              <>Faltan {formatCents(remaining, goal.currency)}</>
            ) : (
              <>Meta alcanzada</>
            )}
            {due && (
              <>
                {" · "}
                <span style={{ color: due.overdue ? "var(--destructive)" : undefined }}>
                  {due.text}
                </span>
              </>
            )}
          </p>
        </div>

        <span className="text-xs font-bold tabular-nums text-foreground shrink-0">{pct}%</span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${goal.name}: ${pct}% de ${formatCents(goal.targetAmount, goal.currency)}`}
        className="h-1.5 rounded-full overflow-hidden"
        style={{ background: "var(--surface-2, var(--muted))" }}
      >
        <div
          className="h-full rounded-full bar-fill"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${goal.color}, color-mix(in oklch, ${goal.color} 55%, white))`,
            minWidth: pct > 0 ? "6px" : "0",
          }}
        />
      </div>
    </li>
  );
}

/**
 * Top-3 metas activas ordenadas por cercanía a completarse. Las metas ya tenían
 * backend y pantalla propia en /presupuestos?tab=metas, pero ninguna presencia
 * en el dashboard: era el único módulo de ahorro invisible desde el inicio.
 */
export const GoalsMiniList = memo(function GoalsMiniList({ goals }: GoalsMiniListProps) {
  const top = useMemo(() => {
    if (goals === undefined) return [];
    return goals
      .filter((g) => g.status === "activa")
      .sort((a, b) => {
        const pa = a.targetAmount > 0 ? progressOf(a) / a.targetAmount : 0;
        const pb = b.targetAmount > 0 ? progressOf(b) / b.targetAmount : 0;
        return pb - pa;
      })
      .slice(0, MAX_VISIBLE);
  }, [goals]);

  const activeCount = goals?.filter((g) => g.status === "activa").length ?? 0;
  const hidden = activeCount - top.length;

  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
          <Target size={14} className="text-muted-foreground" aria-hidden="true" />
          Metas de ahorro
        </h2>
        <Link
          href="/presupuestos?tab=metas"
          className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors py-2 -my-2 px-1"
        >
          Ver todas
        </Link>
      </div>

      <div className="rounded-xl bg-card border border-border overflow-hidden">
        {goals === undefined ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
          </div>
        ) : top.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <p className="text-sm text-muted-foreground text-center">
              Sin metas activas.
            </p>
            <Link
              href="/presupuestos?tab=metas"
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-foreground border border-border bg-card hover:bg-muted/60 transition-colors"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              Crear meta
            </Link>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-border os-enter">
              {top.map((goal) => <GoalRow key={goal._id} goal={goal} />)}
            </ul>
            {hidden > 0 && (
              <div className="px-4 py-2.5 border-t border-border">
                <span className="text-xs text-muted-foreground">
                  {hidden} meta{hidden !== 1 ? "s" : ""} más
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
});
