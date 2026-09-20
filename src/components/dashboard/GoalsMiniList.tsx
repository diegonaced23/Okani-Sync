"use client";

import { memo, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Target } from "lucide-react";
import { formatCents } from "@/lib/money";
import { Skeleton } from "@/components/ui/skeleton";
import { deadlineLabel, viewOf, type Goal } from "@/components/goals/shared";
import { useBalanceHidden } from "@/hooks/use-balance-hidden";
import { GLASS_SURFACE } from "@/lib/ios";
import { cn } from "@/lib/utils";

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

/**
 * Fila de meta. El progreso y la moneda salen de `viewOf` (goals/shared): una meta
 * vinculada a una cuenta avanza con el saldo de esa cuenta, que puede estar en otra
 * moneda — antes se tomaba ese saldo y se formateaba con la moneda de la meta, así
 * que una meta en pesos vinculada a una cuenta en dólares mostraba un porcentaje y
 * un «faltan…» sin sentido.
 */
function GoalRow({ goal, nowMs }: { goal: GoalItem; nowMs: number }) {
  const [balanceHidden] = useBalanceHidden();
  const { currency, remaining, progress } = viewOf(goal as unknown as Goal);
  const pct = Math.min(100, Math.round(progress * 100));
  const due = goal.deadline !== undefined ? deadlineLabel(goal.deadline, nowMs) : null;
  const money = (cents: number) => (balanceHidden ? "$ ••••" : formatCents(cents, currency));

  return (
    <li className="space-y-2 rounded-[16px] px-3 py-3">
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
            {remaining > 0 ? <>Faltan {money(remaining)}</> : <>Meta alcanzada</>}
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
        aria-label={`${goal.name}: ${pct}% de ${formatCents(goal.targetAmount, currency)}`}
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
  // Se fija al montar, no al cargar el módulo: así una sesión de varios días no se
  // queda con el «vence hoy» del día en que se abrió la app.
  const [nowMs] = useState(() => Date.now());

  const top = useMemo(() => {
    if (goals === undefined) return [];
    return goals
      .filter((g) => g.status === "activa")
      .sort((a, b) => viewOf(b as unknown as Goal).progress - viewOf(a as unknown as Goal).progress)
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
          className="touch-hit text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors py-2 -my-2 px-1"
        >
          Ver todas
        </Link>
      </div>

      <div className={cn("rounded-[22px] p-1.5", GLASS_SURFACE)}>
        {goals === undefined ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-[16px]" />)}
          </div>
        ) : top.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <p className="text-sm text-muted-foreground text-center">
              Sin metas activas.
            </p>
            <Link
              href="/presupuestos?tab=metas"
              className="touch-hit inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-foreground border border-border bg-card hover:bg-muted/60 transition-colors"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              Crear meta
            </Link>
          </div>
        ) : (
          <>
            <ul className="os-enter space-y-0.5">
              {top.map((goal) => <GoalRow key={goal._id} goal={goal} nowMs={nowMs} />)}
            </ul>
            {hidden > 0 && (
              <Link
                href="/presupuestos?tab=metas"
                className="block px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                Ver {hidden} meta{hidden !== 1 ? "s" : ""} más
              </Link>
            )}
          </>
        )}
      </div>
    </section>
  );
});
