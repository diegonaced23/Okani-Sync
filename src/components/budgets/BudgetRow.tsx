"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Pencil, RefreshCw, Trash2 } from "lucide-react";
import { CategoryIcon } from "@/components/ui/category-icon";
import { ProgressRing } from "@/components/ui/progress-ring";
import { SwipeRow, type SwipeAction } from "@/components/ui/swipe-row";
import { EASE_OUT_EXPO, tint } from "@/lib/ios";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { STATE_TEXT, STATE_TONE, type Budget, ratioOf, stateOf, thresholdOf, toneOf } from "./shared";

/**
 * Una categoría presupuestada. El anillo lleva el color de la categoría mientras
 * el gasto va bien y cambia a naranja o rojo al pasar el umbral; la barra bajo el
 * nombre muestra ese umbral como una marca, que hasta ahora no se veía en ningún lado.
 */
export function BudgetRow({
  budget,
  index,
  openId,
  setOpenId,
  onOpen,
  onEdit,
  onDelete,
}: {
  budget: Budget;
  index: number;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const reduce = useReducedMotion();
  const ratio = ratioOf(budget);
  const state = stateOf(budget);
  const tone = toneOf(budget);
  const threshold = thresholdOf(budget);
  const remaining = budget.amount - budget.spent;

  const actions: SwipeAction[] = [
    { key: "edit", label: "Editar", icon: Pencil, className: "bg-[var(--os-violet-2)]", onAction: onEdit },
    { key: "delete", label: "Eliminar", icon: Trash2, className: "bg-[var(--os-magenta-2)]", onAction: onDelete },
  ];

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
      <SwipeRow id={budget._id} actions={actions} openId={openId} setOpenId={setOpenId} className="rounded-[18px]">
        <button
          type="button"
          onClick={onOpen}
          className="flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition-colors hover:bg-muted/50 active:bg-muted/70"
        >
          <ProgressRing
            value={Math.min(ratio, 1)}
            color={tone}
            size={46}
            stroke={4.5}
            label={`${Math.round(ratio * 100)}% gastado`}
          >
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full"
              style={{ background: tint(budget.categoryColor ?? tone, 16), color: budget.categoryColor ?? tone }}
            >
              <CategoryIcon name={budget.categoryIcon ?? "tag"} className="h-4 w-4" aria-hidden="true" />
            </span>
          </ProgressRing>

          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[15px] font-semibold leading-tight text-foreground">
                {budget.categoryName ?? "Sin categoría"}
              </span>
              {budget.recurring && (
                <RefreshCw className="h-3 w-3 shrink-0 text-muted-foreground" role="img" aria-label="Se repite cada mes" />
              )}
            </span>

            {/* Barra con la marca del umbral de alerta */}
            <span className="relative mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <motion.span
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ background: tone }}
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${Math.min(ratio, 1) * 100}%` }}
                transition={{ duration: 0.7, ease: EASE_OUT_EXPO, delay: 0.1 + Math.min(index, 12) * 0.03 }}
              />
              {threshold < 100 && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 h-full w-[2px] bg-foreground/35"
                  style={{ left: `calc(${threshold}% - 1px)` }}
                />
              )}
            </span>

            <span className="mt-1.5 block truncate text-xs text-muted-foreground">
              {formatCents(budget.spent, budget.currency)} de {formatCents(budget.amount, budget.currency)}
            </span>
          </span>

          <span className="flex shrink-0 flex-col items-end gap-1">
            <span
              className={cn("font-mono-num text-sm font-bold tabular-nums")}
              style={{ color: remaining < 0 ? "var(--os-magenta)" : undefined }}
            >
              {remaining < 0 ? `−${formatCents(-remaining, budget.currency)}` : formatCents(remaining, budget.currency)}
            </span>
            <span
              className="rounded-full px-2 py-px text-[11px] font-semibold"
              style={{ background: tint(STATE_TONE[state], 18), color: STATE_TEXT[state] }}
            >
              {state === "over" ? "Excedido" : `${Math.round(ratio * 100)}%`}
            </span>
          </span>
        </button>
      </SwipeRow>
    </motion.li>
  );
}
