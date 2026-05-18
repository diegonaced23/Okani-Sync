"use client";

// Versión compacta de PurchaseRow para los tabs del módulo de tarjetas.
// Recibe los installments como prop (sin useQuery propio) para eliminar
// el problema N+1 de queries que tenía la implementación anterior.

import { useState } from "react";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InstallmentSchedule } from "./InstallmentSchedule";
import { formatCents } from "@/lib/money";

// Tipo mínimo de cuota para no acoplar al Doc completo de Convex
type InstallmentLike = {
  _id: string;
  installmentNumber: number;
  amount: number;
  dueDate: number;
  paid: boolean;
  paidAt?: number;
  principalAmount?: number;
  interestAmount?: number;
};

interface CompactPurchaseRowProps {
  purchase: Doc<"cardPurchases">;
  // Cronograma completo de la compra (pagadas + pendientes)
  installments: InstallmentLike[] | undefined;
  currency: string;
  categoryName?: string;
  onEdit: (p: Doc<"cardPurchases">) => void;
  onDelete: (id: Id<"cardPurchases">) => void;
}

export function CompactPurchaseRow({
  purchase,
  installments,
  currency,
  categoryName,
  onEdit,
  onDelete,
}: CompactPurchaseRowProps) {
  const [expanded, setExpanded] = useState(false);

  const paidCount = purchase.paidInstallments;
  const totalCount = purchase.totalInstallments;
  // Progreso de cuotas pagadas como porcentaje para la barra visual
  const progress = totalCount > 0 ? (paidCount / totalCount) * 100 : 0;

  return (
    <div className="border-b border-border last:border-0">
      <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-muted/40 transition-colors">

        {/* Zona expandible — ocupa todo el espacio disponible */}
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          aria-controls={`purchase-detail-${purchase._id}`}
          className="flex-1 min-w-0 flex items-center gap-2 text-left"
        >
          <div className="flex-1 min-w-0">
            {/* Descripción de la compra */}
            <p className="text-sm font-medium text-foreground truncate">
              {purchase.description}
            </p>
            {/* Categoría y fecha de compra */}
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {[
                categoryName,
                new Date(purchase.purchaseDate).toLocaleDateString("es-CO", {
                  day: "2-digit",
                  month: "short",
                }),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {/* Barra de progreso — solo si hay múltiples cuotas */}
            {totalCount > 1 && (
              <div className="flex items-center gap-1.5 mt-1">
                <div className="flex-1 h-0.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                  {paidCount}/{totalCount}
                </span>
              </div>
            )}
          </div>

          {/* Monto de la cuota mensual */}
          <div className="text-right shrink-0">
            <p className="text-xs font-semibold text-foreground tabular-nums">
              {formatCents(purchase.amountPerInstallment, currency)}/mes
            </p>
            {purchase.hasInterest && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 mt-0.5">
                +interés
              </Badge>
            )}
          </div>

          {/* Ícono de expansión */}
          {expanded
            ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
        </button>

        {/* Acciones inline — editar y eliminar */}
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => onEdit(purchase)}
            aria-label="Editar compra"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-danger"
            onClick={() => onDelete(purchase._id)}
            aria-label="Eliminar compra"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Cronograma expandido — muestra solo cuando el usuario lo solicita */}
      {expanded && (
        <div id={`purchase-detail-${purchase._id}`} className="px-4 pb-3">
          {installments === undefined ? (
            <div className="h-24 rounded-lg bg-muted/40 animate-pulse" />
          ) : (
            <InstallmentSchedule
              // El componente espera Doc<"cardInstallments">, casteamos ya que la
              // forma de los datos es compatible (mismos campos requeridos)
              installments={installments as Parameters<typeof InstallmentSchedule>[0]["installments"]}
              currency={currency}
            />
          )}
        </div>
      )}
    </div>
  );
}
