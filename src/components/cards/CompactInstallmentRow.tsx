"use client";

// Fila compacta para mostrar UNA cuota individual en el tab "A pagar".
// No tiene acciones de edición — para editar se usa la compra padre.

import type { Doc } from "../../../convex/_generated/dataModel";
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
  // Compra padre para mostrar descripción, categoría y total de cuotas
  purchase: Doc<"cardPurchases">;
  currency: string;
  categoryName?: string;
}

export function CompactInstallmentRow({
  installment,
  purchase,
  currency,
  categoryName,
}: CompactInstallmentRowProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0">
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

      {/* Monto de esta cuota específica */}
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
    </div>
  );
}
