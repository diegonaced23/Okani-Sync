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
import { Check, Clock, CalendarDays, CreditCard, Pencil, Trash2 } from "lucide-react";
import { useNewTransactionModal } from "@/contexts/new-transaction-modal";
import { CardPurchaseEditForm } from "./CardPurchaseEditForm";

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
  const { openWithCard } = useNewTransactionModal();
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
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
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
      {!purchase ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-14 rounded-xl animate-pulse"
              style={{ background: "var(--surface-2)" }}
            />
          ))}
        </div>
      ) : editing ? (
        <CardPurchaseEditForm
          purchase={purchase}
          onSuccess={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="space-y-5">

          {/* ── Cabecera ── */}
          <div
            className="rounded-2xl p-4 space-y-1"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          >
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
          </div>

          {/* ── Barra de progreso ── */}
          <div className="space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Progreso
              </span>
              <span className="text-xs font-bold text-foreground">
                {paidCount} de {totalCount} cuotas
              </span>
            </div>

            <div
              role="progressbar"
              aria-valuenow={Math.round(progress)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${paidCount} de ${totalCount} cuotas pagadas`}
              className="h-2 rounded-full overflow-hidden"
              style={{ background: "var(--muted)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progress}%`,
                  background: progress >= 100
                    ? "var(--os-lime)"
                    : "linear-gradient(90deg, var(--os-cyan), var(--os-lime))",
                }}
              />
            </div>

            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Pagado: {formatCents(amountPaid, purchase.currency)}</span>
              {amountPending > 0 && (
                <span>Pendiente: {formatCents(amountPending, purchase.currency)}</span>
              )}
            </div>

            {currentInstallment && amountPending > 0 && (
              <p className="text-xs text-muted-foreground">
                Próxima cuota en {formatMonthLong(currentInstallment.dueDate)}
              </p>
            )}
          </div>

          {/* ── Cronograma ── */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Cronograma
            </p>
            <div
              className="rounded-xl overflow-hidden divide-y"
              style={{ border: "1px solid var(--border)" }}
            >
              {(installments ?? []).map((inst, idx, arr) => {
                const isCurrent = !inst.paid && (idx === 0 || arr[idx - 1].paid);
                return (
                  <div
                    key={inst._id}
                    className="flex items-center gap-3 px-4 py-3"
                    style={{
                      background: isCurrent
                        ? "color-mix(in oklch, var(--os-cyan) 8%, var(--surface-2))"
                        : "var(--surface-2)",
                    }}
                  >
                    <span
                      className="flex-shrink-0 flex items-center justify-center rounded-full"
                      aria-label={inst.paid ? "Pagada" : isCurrent ? "Cuota actual" : "Pendiente"}
                      style={{
                        width: 28, height: 28,
                        background: inst.paid
                          ? "color-mix(in oklch, var(--os-lime) 18%, transparent)"
                          : isCurrent
                            ? "color-mix(in oklch, var(--os-cyan) 18%, transparent)"
                            : "var(--muted)",
                        color: inst.paid
                          ? "var(--os-lime)"
                          : isCurrent
                            ? "var(--os-cyan)"
                            : "var(--muted-foreground)",
                      }}
                    >
                      {inst.paid
                        ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                        : <Clock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                      }
                    </span>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        Cuota {inst.installmentNumber}/{totalCount}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateShort(inst.dueDate)}
                      </p>
                    </div>

                    <span
                      className="font-mono-num text-sm font-bold shrink-0"
                      style={{
                        color: inst.paid ? "var(--muted-foreground)" : "var(--foreground)",
                        textDecoration: inst.paid ? "line-through" : "none",
                      }}
                    >
                      {formatCents(inst.amount, purchase.currency)}
                    </span>
                  </div>
                );
              })}
            </div>
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

          {/* ── CTA: registrar pago — solo visible mientras haya cuotas pendientes ── */}
          {amountPending > 0 && card && (
            <button
              type="button"
              onClick={() => {
                openWithCard(card._id);
                onOpenChange(false);
              }}
              className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold transition-opacity active:opacity-70"
              style={{
                background: "linear-gradient(135deg, var(--os-cyan), var(--os-lime))",
                color: "var(--background)",
              }}
            >
              <CreditCard className="h-4 w-4" aria-hidden="true" />
              Registrar pago
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
    </>
  );
}
