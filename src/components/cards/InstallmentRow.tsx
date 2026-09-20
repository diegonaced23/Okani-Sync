"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Pencil, Trash2 } from "lucide-react";
import type { Id } from "../../../convex/_generated/dataModel";
import { SwipeRow, type SwipeAction } from "@/components/ui/swipe-row";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { EASE_OUT_EXPO, interestOf, tint, type InstallmentLike, type Purchase } from "./shared";

/**
 * Una cuota suelta en «A pagar». Editar y eliminar actúan sobre la COMPRA padre,
 * no sobre la cuota: una cuota no existe por sí sola.
 */
export function InstallmentRow({
  installment,
  purchase,
  currency,
  categoryName,
  index,
  overdue,
  openId,
  setOpenId,
  onEdit,
  onDelete,
}: {
  installment: InstallmentLike;
  purchase: Purchase;
  currency: string;
  categoryName?: string;
  index: number;
  /** El día de pago de la tarjeta ya pasó */
  overdue?: boolean;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  onEdit: (p: Purchase) => void;
  onDelete: (id: Id<"cardPurchases">) => void;
}) {
  const reduce = useReducedMotion();
  // La edición financiera solo tiene sentido si aún no se aplicó ningún pago
  const canEdit = purchase.paidInstallments === 0;
  // `interestOf` evita el «0» que se colaba en pantalla cuando la compra marcaba
  // interés y la cuota tenía exactamente cero
  const interest = purchase.hasInterest ? interestOf(installment) : undefined;

  const actions: SwipeAction[] = [
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
    purchase.totalInstallments > 1
      ? `Cuota ${installment.installmentNumber}/${purchase.totalInstallments}`
      : null,
    new Date(installment.dueDate).toLocaleDateString("es-CO", { day: "2-digit", month: "short" }),
  ].filter(Boolean).join(" · ");

  return (
    <motion.li
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0, transition: { duration: 0.28, ease: EASE_OUT_EXPO } }}
      transition={{ duration: 0.38, ease: EASE_OUT_EXPO, delay: Math.min(index, 12) * 0.03 }}
      className="list-none overflow-hidden rounded-[16px]"
    >
      <SwipeRow
        id={installment._id}
        actions={actions}
        openId={openId}
        setOpenId={setOpenId}
        className="rounded-[16px]"
      >
        <div className="flex w-full items-center gap-3 rounded-[16px] px-3 py-2.5">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono-num text-[11px] font-extrabold tabular-nums"
            style={
              overdue
                ? { background: tint("var(--os-magenta)", 15), color: "var(--os-magenta)" }
                : { background: tint("var(--os-cyan)", 14), color: "var(--os-cyan-text)" }
            }
          >
            {installment.installmentNumber}
          </span>

          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold leading-tight text-foreground">
              {purchase.description}
            </span>
            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{subtitle}</span>
          </span>

          <span className="flex shrink-0 flex-col items-end">
            <span
              className={cn("font-mono-num text-sm font-bold tabular-nums")}
              style={{ color: overdue ? "var(--os-magenta)" : undefined }}
            >
              {formatCents(installment.amount, currency)}
            </span>
            {interest !== undefined && (
              <span className="font-mono-num text-[10px] tabular-nums" style={{ color: "var(--os-orange-text)" }}>
                +{formatCents(interest, currency)} int.
              </span>
            )}
          </span>
        </div>
      </SwipeRow>
    </motion.li>
  );
}
