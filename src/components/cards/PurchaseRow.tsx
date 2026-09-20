"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronRight, Pencil, Trash2 } from "lucide-react";
import type { Id } from "../../../convex/_generated/dataModel";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Skeleton } from "@/components/ui/skeleton";
import { SwipeRow, type SwipeAction } from "@/components/ui/swipe-row";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { InstallmentSchedule } from "./InstallmentSchedule";
import {
  EASE_OUT_EXPO,
  purchaseProgress,
  tint,
  type InstallmentLike,
  type Purchase,
} from "./shared";

/**
 * Una compra de la tarjeta. El anillo lleva las cuotas pagadas, así que se ve el
 * avance sin leer «3/12»; al tocarla se despliega el cronograma completo, y editar
 * o eliminar viven en el swipe como en el resto de la app.
 */
export function PurchaseRow({
  purchase,
  installments,
  currency,
  categoryName,
  index,
  settled,
  openId,
  setOpenId,
  onEdit,
  onDelete,
}: {
  purchase: Purchase;
  installments: InstallmentLike[] | undefined;
  currency: string;
  categoryName?: string;
  index: number;
  /** Compra liquidada: se muestra en el historial, sin acciones */
  settled?: boolean;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  onEdit: (p: Purchase) => void;
  onDelete: (id: Id<"cardPurchases">) => void;
}) {
  const reduce = useReducedMotion();
  const [expanded, setExpanded] = useState(false);

  // `installmentsByPurchase` solo se construye para las compras activas, así que
  // una liquidada no tiene cronograma que desplegar: se queda sin expandir en vez
  // de mostrar un esqueleto que nunca carga.
  const expandable = !settled;
  const progress = purchaseProgress(purchase);
  const done = settled || purchase.paidInstallments >= purchase.totalInstallments;
  const tone = done ? "var(--os-lime)" : "var(--os-cyan)";
  // La edición financiera solo tiene sentido si aún no se aplicó ningún pago
  const canEdit = purchase.paidInstallments === 0;

  const actions: SwipeAction[] = settled
    ? []
    : [
        ...(canEdit
          ? [{
              key: "edit",
              label: "Editar",
              icon: Pencil,
              className: "bg-[var(--os-violet-2)]",
              onAction: () => onEdit(purchase),
            }]
          : []),
        {
          key: "delete",
          label: "Eliminar",
          icon: Trash2,
          className: "bg-[var(--os-magenta-2)]",
          onAction: () => onDelete(purchase._id),
        },
      ];

  const subtitle = [
    categoryName,
    new Date(purchase.purchaseDate).toLocaleDateString("es-CO", { day: "2-digit", month: "short" }),
    purchase.totalInstallments > 1
      ? `${purchase.paidInstallments}/${purchase.totalInstallments} cuotas`
      : "Una sola cuota",
  ].filter(Boolean).join(" · ");

  return (
    <motion.li
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0, transition: { duration: 0.28, ease: EASE_OUT_EXPO } }}
      transition={{ duration: 0.38, ease: EASE_OUT_EXPO, delay: Math.min(index, 12) * 0.03 }}
      className="list-none overflow-hidden rounded-[18px]"
    >
      <SwipeRow
        id={purchase._id}
        actions={actions}
        openId={openId}
        setOpenId={setOpenId}
        disabled={actions.length === 0}
        className="rounded-[18px]"
      >
        <button
          type="button"
          onClick={() => { if (expandable) setExpanded((v) => !v); }}
          aria-expanded={expandable ? expanded : undefined}
          aria-controls={expandable ? `purchase-${purchase._id}` : undefined}
          className={cn(
            "flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition-colors hover:bg-muted/50 active:bg-muted/70",
            settled && "opacity-75",
          )}
        >
          <ProgressRing
            value={progress}
            color={tone}
            size={44}
            stroke={4.5}
            label={`${purchase.paidInstallments} de ${purchase.totalInstallments} cuotas pagadas`}
          >
            {done ? (
              <Check className="h-4 w-4" strokeWidth={3} style={{ color: "var(--os-lime-text)" }} aria-hidden="true" />
            ) : (
              <span className="font-mono-num text-[11px] font-extrabold tabular-nums text-foreground">
                {purchase.totalInstallments > 1 ? purchase.totalInstallments - purchase.paidInstallments : 1}
              </span>
            )}
          </ProgressRing>

          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold leading-tight text-foreground">
              {purchase.description}
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{subtitle}</span>
          </span>

          <span className="flex shrink-0 flex-col items-end gap-1">
            <span className="font-mono-num text-sm font-bold tabular-nums text-foreground">
              {formatCents(purchase.amountPerInstallment, currency)}
              {purchase.totalInstallments > 1 && (
                <span className="font-sans text-[11px] font-semibold text-muted-foreground">/mes</span>
              )}
            </span>
            {purchase.hasInterest && (
              <span
                className="rounded-full px-2 py-px text-[11px] font-semibold"
                style={{ background: tint("var(--os-orange)", 16), color: "var(--os-orange-text)" }}
              >
                Con interés
              </span>
            )}
          </span>

          {expandable && (
            <motion.span
              animate={{ rotate: expanded ? 90 : 0 }}
              transition={{ duration: 0.2 }}
              className="flex shrink-0 text-muted-foreground"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </motion.span>
          )}
        </button>
      </SwipeRow>

      <AnimatePresence initial={false}>
        {expandable && expanded && (
          <motion.div
            id={`purchase-${purchase._id}`}
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1">
              {installments === undefined ? (
                <Skeleton className="h-24 rounded-[14px]" />
              ) : (
                <InstallmentSchedule installments={installments} currency={currency} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}
