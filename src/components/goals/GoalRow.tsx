"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Link2, PiggyBank, RotateCcw, Pencil, Trash2 } from "lucide-react";
import { ProgressRing } from "@/components/ui/progress-ring";
import { SwipeRow, type SwipeAction } from "@/components/ui/swipe-row";
import { EASE_OUT_EXPO, tint } from "@/lib/ios";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { deadlineLabel, monthlyNeeded, viewOf, type Goal } from "./shared";

/**
 * Una meta de ahorro. El emoji va dentro del anillo de progreso, así que el avance
 * se lee sin tener que buscar un porcentaje. Las metas vinculadas a una cuenta no
 * ofrecen abono: su progreso lo manda el saldo de la cuenta.
 */
export function GoalRow({
  goal,
  index,
  nowMs,
  openId,
  setOpenId,
  onAddFunds,
  onEdit,
  onDelete,
  onReactivate,
}: {
  goal: Goal;
  index: number;
  nowMs: number;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  onAddFunds: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReactivate: () => void;
}) {
  const reduce = useReducedMotion();
  const { linked, account, saved, currency, progress, remaining, completed } = viewOf(goal);
  const tone = completed ? "var(--os-lime)" : goal.color;
  const deadline = !completed && goal.deadline ? deadlineLabel(goal.deadline, nowMs) : null;
  const monthly = !completed && goal.deadline ? monthlyNeeded(remaining, goal.deadline, nowMs) : null;

  const actions: SwipeAction[] = [
    ...(completed
      ? [{ key: "reactivate", label: "Reactivar", icon: RotateCcw, className: "bg-[var(--os-cyan-2)]", onAction: onReactivate }]
      : linked
        ? []
        : [{ key: "add", label: "Abonar", icon: PiggyBank, className: "bg-[var(--os-lime-2)]", onAction: onAddFunds }]),
    { key: "edit", label: "Editar", icon: Pencil, className: "bg-[var(--os-violet-2)]", onAction: onEdit },
    { key: "delete", label: "Eliminar", icon: Trash2, className: "bg-[var(--os-magenta-2)]", onAction: onDelete },
  ];

  const subtitle = linked && account
    ? `Saldo de ${account.name}`
    : monthly !== null
      ? `Ahorra ${formatCents(monthly, currency)} al mes`
      : completed
        ? `Objetivo de ${formatCents(goal.targetAmount, currency)} cumplido`
        : `Faltan ${formatCents(remaining, currency)}`;

  return (
    <motion.li
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0, transition: { duration: 0.28, ease: EASE_OUT_EXPO } }}
      transition={{
        opacity: { duration: 0.4, ease: EASE_OUT_EXPO, delay: Math.min(index, 12) * 0.035 },
        scale: { duration: 0.4, ease: EASE_OUT_EXPO, delay: Math.min(index, 12) * 0.035 },
        layout: { duration: 0.3, ease: EASE_OUT_EXPO },
      }}
      className="list-none overflow-hidden rounded-[18px]"
    >
      <SwipeRow id={goal._id} actions={actions} openId={openId} setOpenId={setOpenId} className="rounded-[18px]">
        <button
          type="button"
          onClick={completed ? onEdit : linked ? onEdit : onAddFunds}
          className={cn(
            "flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition-colors hover:bg-muted/50 active:bg-muted/70",
            completed && "opacity-85",
          )}
        >
          <ProgressRing
            value={progress}
            color={tone}
            size={46}
            stroke={4.5}
            label={`${Math.round(progress * 100)}% de la meta`}
          >
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full text-[15px]"
              style={{ background: tint(tone, 16) }}
            >
              {goal.icon}
            </span>
          </ProgressRing>

          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[15px] font-semibold leading-tight text-foreground">{goal.name}</span>
              {linked && (
                <Link2 className="h-3 w-3 shrink-0" style={{ color: "var(--os-cyan-text)" }} role="img" aria-label="Vinculada a una cuenta" />
              )}
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{subtitle}</span>
          </span>

          <span className="flex shrink-0 flex-col items-end gap-1">
            <span className="font-mono-num text-sm font-bold tabular-nums text-foreground">
              {formatCents(saved, currency)}
            </span>
            {completed ? (
              <span
                className="rounded-full px-2 py-px text-[11px] font-semibold"
                style={{ background: tint("var(--os-lime)", 20), color: "var(--os-lime-text)" }}
              >
                Cumplida
              </span>
            ) : deadline ? (
              <span
                className={cn("rounded-full px-2 py-px text-[11px] font-semibold", !deadline.urgent && "bg-muted/70 text-muted-foreground")}
                style={
                  deadline.overdue
                    ? { background: tint("var(--os-magenta)", 15), color: "var(--os-magenta)" }
                    : deadline.urgent
                      ? { background: tint("var(--os-orange)", 18), color: "var(--os-orange-text)" }
                      : undefined
                }
              >
                {deadline.text}
              </span>
            ) : (
              <span className="text-[11px] font-semibold tabular-nums" style={{ color: tone }}>
                {Math.round(progress * 100)}%
              </span>
            )}
          </span>
        </button>
      </SwipeRow>
    </motion.li>
  );
}
