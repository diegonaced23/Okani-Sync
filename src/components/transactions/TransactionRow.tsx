"use client";

import { memo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Pencil, Trash2 } from "lucide-react";
import type { Doc } from "../../../convex/_generated/dataModel";
import { SwipeRow, type SwipeAction } from "@/components/ui/swipe-row";
import { TransactionItem } from "./TransactionItem";
import { EASE_OUT_EXPO, canDeleteTx, canEditTx, isFromCardPurchase } from "./shared";

interface CategoryInfo {
  name: string;
  icon: string;
  color: string;
}

interface CardInfo {
  name: string;
  lastFourDigits: string;
}

/**
 * Fila de la lista con las acciones de deslizar. Envuelve a `TransactionItem` en vez
 * de modificarlo: esa fila también la usan reportes y el detalle de cuenta, donde no
 * se quiere deslizar nada.
 *
 * Las acciones respetan las reglas del detalle: solo se edita lo que el detalle deja
 * editar, un ajuste no se borra (el backend lo rechaza) y una fila que nace de una
 * compra a cuotas no ofrece nada, porque sus acciones viven en la compra.
 */
export const TransactionRow = memo(function TransactionRow({
  transaction: tx,
  category,
  accountMap,
  cardMap,
  index,
  openId,
  setOpenId,
  onPress,
  onEdit,
  onDelete,
}: {
  transaction: Doc<"transactions">;
  category?: CategoryInfo;
  accountMap?: Record<string, string>;
  cardMap?: Record<string, CardInfo>;
  index: number;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  onPress: (tx: Doc<"transactions">) => void;
  onEdit: (tx: Doc<"transactions">) => void;
  onDelete: (tx: Doc<"transactions">) => void;
}) {
  const reduce = useReducedMotion();
  const fromPurchase = isFromCardPurchase(tx);

  const actions: SwipeAction[] = fromPurchase
    ? []
    : [
        ...(canEditTx(tx)
          ? [{
              key: "edit",
              label: "Editar",
              icon: Pencil,
              className: "bg-[var(--os-violet-2)]",
              onAction: () => onEdit(tx),
            }]
          : []),
        ...(canDeleteTx(tx)
          ? [{
              key: "delete",
              label: "Eliminar",
              icon: Trash2,
              className: "bg-[var(--os-magenta-2)]",
              onAction: () => onDelete(tx),
            }]
          : []),
      ];

  return (
    <motion.li
      // Sin `layout`: la lista puede traer cientos de filas y medirlas todas cuesta
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: EASE_OUT_EXPO, delay: Math.min(index, 12) * 0.025 }}
      className="list-none overflow-hidden rounded-[18px]"
    >
      <SwipeRow
        id={tx._id}
        actions={actions}
        openId={openId}
        setOpenId={setOpenId}
        disabled={actions.length === 0}
        className="rounded-[18px]"
      >
        <TransactionItem
          transaction={tx}
          category={category}
          accountMap={accountMap}
          cardMap={cardMap}
          onPress={onPress}
        />
      </SwipeRow>
    </motion.li>
  );
});
