"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Archive, ArchiveRestore, Check, HandCoins } from "lucide-react";
import { ProgressRing } from "@/components/ui/progress-ring";
import { SwipeRow, type SwipeAction } from "@/components/ui/swipe-row";
import { EASE_OUT_EXPO, tint } from "@/lib/ios";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { DEBT_TYPE_META, dueLabel, initialOf, progressOf, toneOf, type Obligation } from "./shared";

export function ObligationRow({
  o,
  index,
  openId,
  setOpenId,
  onOpen,
  onPay,
  onToggleArchive,
}: {
  o: Obligation;
  index: number;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  onOpen: () => void;
  onPay: () => void;
  onToggleArchive: () => void;
}) {
  const reduce = useReducedMotion();
  const progress = progressOf(o);
  const tone = toneOf(o);
  const paid = o.status === "pagada";
  const due = !paid && o.dueDate ? dueLabel(o.dueDate) : null;
  const TypeIcon = o.debtType ? DEBT_TYPE_META[o.debtType].icon : null;

  const actions: SwipeAction[] = [
    ...(!paid && !o.archived
      ? [{
          key: "pay",
          label: o.kind === "debt" ? "Abonar" : "Cobrar",
          icon: HandCoins,
          className: "bg-[var(--os-lime-2)]",
          onAction: onPay,
        }]
      : []),
    o.archived
      ? { key: "unarchive", label: "Restaurar", icon: ArchiveRestore, className: "bg-[var(--os-cyan-2)]", onAction: onToggleArchive }
      : { key: "archive", label: "Archivar", icon: Archive, className: "bg-[var(--os-orange-2)]", onAction: onToggleArchive },
  ];

  const subtitle = [
    o.counterpart,
    o.debtType ? DEBT_TYPE_META[o.debtType].label : null,
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
      className="list-none overflow-hidden rounded-[18px]"
    >
      <SwipeRow id={o.id} actions={actions} openId={openId} setOpenId={setOpenId} className="rounded-[18px]">
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            "flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition-colors hover:bg-muted/50 active:bg-muted/70",
            o.archived && "opacity-60",
          )}
        >
          <ProgressRing
            value={progress}
            color={tone}
            size={46}
            stroke={4.5}
            label={`${Math.round(progress * 100)}% ${o.kind === "debt" ? "pagado" : "cobrado"}`}
          >
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-extrabold"
              style={{ background: tint(o.color, 16), color: o.color }}
            >
              {paid
                ? <Check className="h-4 w-4 text-lime-text" strokeWidth={3} aria-hidden="true" />
                : TypeIcon
                  ? <TypeIcon className="h-4 w-4" aria-hidden="true" />
                  : initialOf(o.counterpart)}
            </span>
          </ProgressRing>

          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold leading-tight text-foreground">{o.name}</span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{subtitle}</span>
          </span>

          <span className="flex shrink-0 flex-col items-end gap-1">
            <span className={cn(
              "font-mono-num text-sm font-bold tabular-nums",
              paid ? "text-muted-foreground line-through decoration-1" : "text-foreground",
            )}>
              {formatCents(paid ? o.originalAmount : o.currentBalance, o.currency)}
            </span>
            {paid ? (
              <span className="rounded-full bg-[color-mix(in_oklch,var(--os-lime)_20%,transparent)] px-2 py-px text-[11px] font-semibold text-lime-text">
                {o.kind === "debt" ? "Saldada" : "Cobrado"}
              </span>
            ) : due ? (
              <span
                className={cn(
                  "rounded-full px-2 py-px text-[11px] font-semibold",
                  due.overdue ? "text-[var(--os-magenta)]" : due.urgent ? "text-[var(--warning-text)]" : "bg-muted/70 text-muted-foreground",
                )}
                style={due.overdue
                  ? { background: tint("var(--os-magenta)", 15) }
                  : due.urgent ? { background: tint("var(--os-orange)", 18) } : undefined}
              >
                {due.text}
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground">
                {Math.round(progress * 100)}% {o.kind === "debt" ? "pagado" : "cobrado"}
              </span>
            )}
          </span>
        </button>
      </SwipeRow>
    </motion.li>
  );
}
