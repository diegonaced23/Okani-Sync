"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AppSheet } from "@/components/ui/app-sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/money";
import { formatDateShort, formatMonthLong } from "@/lib/utils";
import { toast } from "sonner";
import { CalendarDays, CreditCard, Pencil, Trash2 } from "lucide-react";
import { InstallmentSchedule } from "@/components/cards/InstallmentSchedule";
import { PayCardSheet } from "@/components/cards/PayCardSheet";
import { ProgressRing } from "@/components/ui/progress-ring";
import { CardPurchaseEditForm } from "./CardPurchaseEditForm";
import { errorMessage } from "@/lib/errorMessage";

interface CardPurchaseDetailSheetProps {
  purchaseId: Id<"cardPurchases"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CardPurchaseDetailSheet({
  purchaseId,
  open,
  onOpenChange,
}: CardPurchaseDetailSheetProps) {
  const [payOpen, setPayOpen] = useState(false);
  const deletePurchase = useMutation(api.cardPurchases.deletePurchase);
  const data = useQuery(
    api.cardPurchases.getWithInstallments,
    purchaseId ? { purchaseId } : "skip"
  );

  const { purchase, installments, card } = data ?? {};

  const [editing, setEditing]       = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting]     = useState(false);

  // Salir de modo edición cuando cambia la compra seleccionada o el sheet se cierra.
  // Patrón de estado derivado (render-time setState) para evitar useEffect.
  const [prevPurchaseId, setPrevPurchaseId] = useState(purchaseId);
  if (purchaseId !== prevPurchaseId) {
    setPrevPurchaseId(purchaseId);
    setEditing(false);
  }
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) setEditing(false);
  }

  // Devolver el foco al botón "Editar" al salir del modo edición (cancelar o guardar),
  // sin robárselo en la apertura inicial del sheet.
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const wasEditingRef = useRef(editing);
  useEffect(() => {
    if (wasEditingRef.current && !editing) {
      editButtonRef.current?.focus();
    }
    wasEditingRef.current = editing;
  }, [editing]);

  if (!purchaseId) return null;

  async function handleDelete() {
    if (!purchaseId) return;
    setDeleting(true);
    try {
      await deletePurchase({ purchaseId });
      toast.success("Compra eliminada");
      setDeleteOpen(false);
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, "Error al eliminar"));
    } finally {
      setDeleting(false);
    }
  }

  const paidCount   = purchase?.paidInstallments ?? 0;
  const totalCount  = purchase?.totalInstallments ?? 1;
  const progress    = totalCount > 0 ? (paidCount / totalCount) * 100 : 0;

  const amountPaid    = (installments ?? []).filter((i) => i.paid).reduce((s, i) => s + i.amount, 0);
  const amountPending = (purchase?.totalWithInterest ?? 0) - amountPaid;

  const currentInstallment = (installments ?? []).find(
    (inst, idx, arr) => !inst.paid && (idx === 0 || arr[idx - 1].paid)
  );

  return (
    <>
    <AppSheet
      open={open}
      onOpenChange={(o) => { if (!o) setEditing(false); onOpenChange(o); }}
      title={editing ? "Editar compra" : "Detalle de compra"}
    >
      {data === undefined ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-[18px]"
              style={{ background: "var(--surface-2)" }}
            />
          ))}
        </div>
      ) : !purchase ? (
        // `getWithInstallments` devuelve null si la compra ya no existe. Antes esto se
        // trataba igual que «cargando» y el esqueleto pulsaba para siempre.
        <p className="rounded-[20px] bg-[var(--surface-2)] px-6 py-12 text-center text-sm text-muted-foreground">
          Esta compra ya no existe.
        </p>
      ) : editing ? (
        <CardPurchaseEditForm
          purchase={purchase}
          onSuccess={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="space-y-5">

          {/* ── Cabecera ── */}
          <div className="space-y-1 rounded-[22px] bg-[var(--surface-2)] p-4">
            <p className="font-semibold text-foreground text-base leading-tight">
              {purchase.description}
            </p>
            {card && (
              <p className="text-xs text-muted-foreground">
                {card.name} ····{card.lastFourDigits}
              </p>
            )}
            <div className="flex items-baseline gap-1.5 pt-1">
              <span
                className="font-mono-num font-bold text-foreground"
                style={{ fontSize: 26, letterSpacing: "-0.025em" }}
              >
                {formatCents(purchase.totalWithInterest, purchase.currency)}
              </span>
              <span className="text-xs text-muted-foreground">total</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Compra del {formatDateShort(purchase.purchaseDate)}
            </p>

            {/* Base sin interés y cuota mensual: los guardaba el backend y no se veían */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1.5 text-xs text-muted-foreground">
              {purchase.totalWithInterest !== purchase.totalAmount && (
                <span>
                  Sin interés{" "}
                  <strong className="font-mono-num tabular-nums text-foreground">
                    {formatCents(purchase.totalAmount, purchase.currency)}
                  </strong>
                </span>
              )}
              <span>
                Cuota{" "}
                <strong className="font-mono-num tabular-nums text-foreground">
                  {formatCents(purchase.amountPerInstallment, purchase.currency)}
                </strong>
                {totalCount > 1 ? ` × ${totalCount}` : ""}
              </span>
            </div>

            {purchase.notes && (
              <p className="pt-1.5 text-xs text-foreground">{purchase.notes}</p>
            )}
          </div>

          {/* ── Progreso ── */}
          <div className="flex items-center gap-4 rounded-[22px] bg-[var(--surface-2)] p-4">
            <ProgressRing
              value={totalCount > 0 ? paidCount / totalCount : 0}
              color={progress >= 100 ? "var(--os-lime)" : "var(--os-cyan)"}
              size={64}
              stroke={7}
              label={`${paidCount} de ${totalCount} cuotas pagadas`}
            >
              <span className="flex flex-col items-center leading-none">
                <span className="font-mono-num text-sm font-extrabold tabular-nums text-foreground">
                  {paidCount}/{totalCount}
                </span>
                <span className="mt-0.5 text-[9px] font-semibold uppercase text-muted-foreground">
                  cuotas
                </span>
              </span>
            </ProgressRing>

            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-xs text-muted-foreground">
                Pagado{" "}
                <strong className="font-mono-num tabular-nums text-foreground">
                  {formatCents(amountPaid, purchase.currency)}
                </strong>
              </p>
              {amountPending > 0 && (
                <p className="text-xs text-muted-foreground">
                  Pendiente{" "}
                  <strong className="font-mono-num tabular-nums text-foreground">
                    {formatCents(amountPending, purchase.currency)}
                  </strong>
                </p>
              )}
              {currentInstallment && amountPending > 0 && (
                <p className="text-xs text-muted-foreground">
                  Próxima cuota en {formatMonthLong(currentInstallment.dueDate)}
                </p>
              )}
            </div>
          </div>

          {/* ── Cronograma: el mismo componente que el detalle de la tarjeta, que
                 además pinta el capital, el interés y el saldo que falta por amortizar ── */}
          <div className="space-y-2">
            <p className="px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              Cronograma
            </p>
            <InstallmentSchedule installments={installments ?? []} currency={purchase.currency} />
          </div>

          {/* ── Info de interés ── */}
          {purchase.hasInterest && (purchase.totalInterest ?? 0) > 0 && (
            <div
              className="rounded-xl p-3 flex items-start gap-2"
              style={{
                background: "color-mix(in oklch, var(--os-orange) 8%, transparent)",
                border: "1px solid color-mix(in oklch, var(--os-orange) 20%, transparent)",
              }}
            >
              <CalendarDays className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "var(--os-orange-text)" }} />
              <p className="text-xs text-muted-foreground">
                Interés total: {formatCents(purchase.totalInterest!, purchase.currency)}{" "}
                ({((purchase.interestRate ?? 0) * 100).toFixed(1)}% mensual)
              </p>
            </div>
          )}

          {/* ── CTA: pagar la tarjeta — solo mientras haya cuotas pendientes ──
              Antes esto abría el modal de nueva transacción con la tarjeta
              preseleccionada, que registra OTRA COMPRA: el botón para pagar subía la
              deuda. Ahora abre la hoja de pago real (cards.payCard). */}
          {amountPending > 0 && card && (
            <button
              type="button"
              onClick={() => setPayOpen(true)}
              className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold transition-opacity active:opacity-70"
              style={{
                background: "linear-gradient(135deg, var(--os-cyan), var(--os-lime))",
                color: "var(--background)",
              }}
            >
              <CreditCard className="h-4 w-4" aria-hidden="true" />
              Pagar tarjeta
            </button>
          )}

          {/* ── Editar / Eliminar ── */}
          <div className="flex gap-2">
            <Button type="button" ref={editButtonRef} variant="outline" className="flex-1 gap-1.5" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" />
              Editar
            </Button>
            <Button type="button" variant="outline" className="flex-1 gap-1.5 text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" />
              Eliminar
            </Button>
          </div>

        </div>
      )}
    </AppSheet>

    {/* ── Confirmación de eliminación ── */}
    <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar esta compra?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción es irreversible. Se eliminarán todas las cuotas (pagadas y pendientes), se revertirá el presupuesto afectado y se reducirá la deuda de la tarjeta en el monto de las cuotas no pagadas.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={deleting}>
            {deleting ? "Eliminando…" : "Sí, eliminar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Hoja de pago de la tarjeta. Sin los montos sugeridos: el ciclo lo calcula la
        página de la tarjeta y aquí no está cargado, así que se ofrece el saldo y el
        monto libre en vez de arriesgar una cifra que no coincida. */}
    {card && (
      <PayCardSheet card={card} open={payOpen} onOpenChange={setPayOpen} />
    )}
    </>
  );
}
