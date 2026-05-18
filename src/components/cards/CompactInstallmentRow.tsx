"use client";

// Fila compacta para mostrar UNA cuota individual en el tab "A pagar".
// La edición y eliminación actúan sobre la COMPRA PADRE, no sobre la cuota individual.

import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/money";

// Tipo mínimo de cuota (subset de Doc<"cardInstallments">)
type InstallmentLike = {
  installmentNumber: number;
  amount: number;
  dueDate: number;
  interestAmount?: number;
};

interface CompactInstallmentRowProps {
  installment: InstallmentLike;
  // Compra padre para mostrar descripción, categoría, número de cuotas y acciones
  purchase: Doc<"cardPurchases">;
  currency: string;
  categoryName?: string;
  // Editar: solo disponible si la compra no tiene cuotas pagadas (paidInstallments === 0)
  onEdit?: (p: Doc<"cardPurchases">) => void;
  // Eliminar: dispara el diálogo de doble confirmación en la página padre
  onDelete?: (id: Id<"cardPurchases">) => void;
}

export function CompactInstallmentRow({
  installment,
  purchase,
  currency,
  categoryName,
  onEdit,
  onDelete,
}: CompactInstallmentRowProps) {
  // La edición financiera solo está disponible si aún no se ha aplicado ningún pago
  const canEdit = purchase.paidInstallments === 0;

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border last:border-0">
      {/* Contenido principal */}
      <div className="flex-1 min-w-0">
        {/* Descripción de la compra padre */}
        <p className="text-sm font-medium text-foreground truncate">
          {purchase.description}
        </p>
        {/* Categoría · número de cuota · fecha de vencimiento */}
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {[
            categoryName,
            purchase.totalInstallments > 1
              ? `Cuota ${installment.installmentNumber}/${purchase.totalInstallments}`
              : null,
            new Date(installment.dueDate).toLocaleDateString("es-CO", {
              day: "2-digit",
              month: "short",
            }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      {/* Monto de esta cuota */}
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold tabular-nums text-foreground">
          {formatCents(installment.amount, currency)}
        </p>
        {/* Desglose del interés cuando aplica */}
        {purchase.hasInterest && installment.interestAmount && installment.interestAmount > 0 && (
          <p className="text-[10px] text-warning tabular-nums">
            +{formatCents(installment.interestAmount, currency)} int.
          </p>
        )}
      </div>

      {/* Acciones — editar (solo si no hay pagos) y eliminar */}
      {(onEdit || onDelete) && (
        <div className="flex items-center gap-0.5 shrink-0">
          {/* Editar: solo visible si la compra no tiene cuotas pagadas */}
          {onEdit && canEdit && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => onEdit(purchase)}
              aria-label="Editar compra"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {/* Eliminar: siempre visible, la confirmación se maneja en el padre */}
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-danger"
              onClick={() => onDelete(purchase._id)}
              aria-label="Eliminar compra"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
