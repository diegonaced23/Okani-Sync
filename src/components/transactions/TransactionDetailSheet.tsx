"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { AppSheet } from "@/components/ui/app-sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { TransactionDetail } from "./TransactionDetail";
import { TransactionEditForm } from "./TransactionEditForm";

interface TransactionDetailSheetProps {
  transaction: Doc<"transactions"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TransactionDetailSheet({
  transaction: tx,
  open,
  onOpenChange,
}: TransactionDetailSheetProps) {
  const removeTx = useMutation(api.transactions.remove);

  const [editing, setEditing]       = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [loading, setLoading]       = useState(false);

  // Salir del modo edición cuando cambia la transacción seleccionada o el sheet se
  // vuelve a abrir. Patrón de estado derivado (render-time setState) para evitar useEffect.
  const [prevTx, setPrevTx] = useState(tx);
  if (tx !== prevTx) {
    setPrevTx(tx);
    setEditing(false);
  }

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    // Al abrir y no al cerrar: si se resetea al cerrar, la hoja cambia a la vista
    // de detalle en plena animación de salida (p. ej. al cerrarse tras guardar)
    if (open) setEditing(false);
  }

  // Devolver el foco al botón "Editar" al salir del modo edición (cancelar o guardar),
  // sin robárselo en la apertura inicial del sheet. Efecto puramente imperativo
  // (foco de DOM), no sincroniza estado de React — no aplica la regla de "no setState en efecto".
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const wasEditingRef = useRef(editing);
  useEffect(() => {
    // Cerrada, la hoja conserva el modo edición hasta reabrirse: ese reset no
    // viene de salir de editar y no debe mover el foco
    if (!open) {
      wasEditingRef.current = false;
      return;
    }
    if (wasEditingRef.current && !editing) {
      editButtonRef.current?.focus();
    }
    wasEditingRef.current = editing;
  }, [editing, open]);

  // Guardia después de los hooks para no violar la regla de hooks
  if (!tx) return null;

  // Capturar en variable no-nullable para que los closures async mantengan el narrowing
  const currentTx = tx;

  async function handleDelete() {
    setLoading(true);
    try {
      await removeTx({ transactionId: currentTx._id });
      toast.success("Movimiento eliminado");
      setDeleteOpen(false);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <AppSheet
        open={open}
        onOpenChange={onOpenChange}
        title={editing ? "Editar movimiento" : "Detalle del movimiento"}
      >
        {/* TransactionEditForm se remonta cada vez que editing pasa a true,
            garantizando que su estado local siempre se inicialice desde currentTx. */}
        {editing ? (
          <TransactionEditForm
            tx={currentTx}
            // La confirmación del botón ya muestra cómo quedó: volver a la ficha
            // solo obligaría a cerrarla a mano
            onSuccess={() => onOpenChange(false)}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <TransactionDetail
            tx={currentTx}
            onEdit={() => setEditing(true)}
            onDelete={() => setDeleteOpen(true)}
            editButtonRef={editButtonRef}
          />
        )}
      </AppSheet>

      {/* ── Confirmación de eliminación ───────────────────────────────────────── */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este movimiento?</AlertDialogTitle>
            <AlertDialogDescription>
              {currentTx.type === "transferencia"
                ? "Se eliminarán ambas partes de la transferencia y se revertirán los saldos de las dos cuentas."
                : "Esta acción es irreversible. Se revertirá el saldo de la cuenta o tarjeta correspondiente."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={loading}>
              {loading ? "Eliminando…" : "Sí, eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
