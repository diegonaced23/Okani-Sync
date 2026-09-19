"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowDownLeft, Pause, Play, Repeat, Trash2 } from "lucide-react";
import type { Doc } from "../../../convex/_generated/dataModel";
import { CategoryIcon } from "@/components/ui/category-icon";
import { SwipeRow, type SwipeAction } from "@/components/ui/swipe-row";
import { EASE_OUT_EXPO, tint } from "@/lib/ios";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { daysUntil, describeSchedule, isEnded, kindOf, relativeLabel, type Recurring } from "./shared";

const INCOME_TINT = "var(--os-lime)";
const EXPENSE_TINT = "var(--os-magenta)";

export function RecurringRow({
  rec,
  index,
  category,
  sourceLabel,
  openId,
  setOpenId,
  onEdit,
  onTogglePause,
  onDelete,
}: {
  rec: Recurring;
  index: number;
  category: Pick<Doc<"categories">, "name" | "icon" | "color"> | undefined;
  sourceLabel: string | undefined;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  onEdit: () => void;
  onTogglePause: () => void;
  onDelete: () => void;
}) {
  const reduce = useReducedMotion();
  const income = kindOf(rec) === "ingreso";
  const paused = rec.paused === true;
  const ended = isEnded(rec);
  const days = daysUntil(rec.nextOccurrence);
  const soon = !paused && !ended && days <= 2;
  const tone = category?.color ?? (income ? INCOME_TINT : EXPENSE_TINT);

  const actions: SwipeAction[] = [
    paused
      ? { key: "resume", label: "Reanudar", icon: Play, className: "bg-[var(--os-lime-2)]", onAction: onTogglePause }
      : { key: "pause", label: "Pausar", icon: Pause, className: "bg-[var(--os-orange-2)]", onAction: onTogglePause },
    { key: "delete", label: "Eliminar", icon: Trash2, className: "bg-[var(--os-magenta-2)]", onAction: onDelete },
  ];

  const subtitle = [
    ended ? "Finalizado" : describeSchedule(rec.frequency, rec.nextOccurrence, rec.dayOfMonth),
    sourceLabel,
  ].filter(Boolean).join(" · ");

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
      className="list-none overflow-hidden rounded-[16px]"
    >
      <SwipeRow id={rec._id} actions={actions} openId={openId} setOpenId={setOpenId}>
        <button
          type="button"
          onClick={onEdit}
          className={cn(
            "flex w-full items-center gap-3 rounded-[16px] px-3 py-2.5 text-left transition-colors hover:bg-muted/50 active:bg-muted/70",
            (paused || ended) && "opacity-60",
          )}
        >
          <span
            className={cn(
              "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]",
              (paused || ended) && "grayscale",
            )}
            style={{ background: tint(tone, 17), color: tone, boxShadow: `inset 0 0 0 1px ${tint(tone, 22)}` }}
          >
            {category
              ? <CategoryIcon name={category.icon} className="h-[18px] w-[18px]" aria-hidden="true" />
              : income
                ? <ArrowDownLeft className="h-[18px] w-[18px]" aria-hidden="true" />
                : <Repeat className="h-[18px] w-[18px]" aria-hidden="true" />}
            {paused && (
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-card text-muted-foreground ring-1 ring-border">
                <Pause className="h-2.5 w-2.5" fill="currentColor" aria-hidden="true" />
              </span>
            )}
          </span>

          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold leading-tight text-foreground">
              {rec.description}
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{subtitle}</span>
          </span>

          <span className="flex shrink-0 flex-col items-end gap-1">
            <span className={cn(
              "font-mono-num text-sm font-bold tabular-nums",
              income ? "text-lime-text" : "text-foreground",
            )}>
              {income ? "+" : "−"}{formatCents(rec.amount, rec.currency)}
            </span>
            {paused ? (
              <span className="rounded-full bg-muted px-2 py-px text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Pausado
              </span>
            ) : !ended && (
              <span
                className={cn(
                  "rounded-full px-2 py-px text-[11px] font-semibold",
                  soon ? "text-[var(--warning-text)]" : "bg-muted/70 text-muted-foreground",
                )}
                style={soon ? { background: tint("var(--os-orange)", 18) } : undefined}
              >
                {relativeLabel(rec.nextOccurrence)}
              </span>
            )}
          </span>
        </button>
      </SwipeRow>
    </motion.li>
  );
}
