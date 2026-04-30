"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";

interface DeleteUserDialogProps {
  targetClerkId: string;
  targetEmail: string;
  targetName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

export function DeleteUserDialog({
  targetClerkId,
  targetEmail,
  targetName,
  open,
  onOpenChange,
  onDeleted,
}: DeleteUserDialogProps) {
  const deleteUser = useAction(api.actions.deleteUserCascade.runByAdmin);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const isConfirmed = confirmEmail.trim().toLowerCase() === targetEmail.toLowerCase();

  async function handleDelete() {
    if (!isConfirmed) return;
    setLoading(true);
    try {
      await deleteUser({ targetClerkId, targetEmail });
      toast.success(`Usuario ${targetName} eliminado correctamente`);
      onOpenChange(false);
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar usuario");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-danger">Eliminar usuario</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="flex gap-3 rounded-lg bg-danger/10 border border-danger/20 p-3">
            <AlertTriangle className="h-5 w-5 text-danger shrink-0 mt-0.5" />
            <div className="text-sm space-y-1">
              <p className="font-semibold text-foreground">Acción irreversible</p>
              <p className="text-muted-foreground">
                Se eliminarán <strong>todos los datos</strong> de <strong>{targetName}</strong>:
                cuentas, tarjetas, transacciones, deudas, presupuestos y su cuenta de Clerk.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="del-confirm">
              Escribe el correo del usuario para confirmar:
            </Label>
            <p className="text-xs text-muted-foreground font-mono">{targetEmail}</p>
            <Input
              id="del-confirm"
              type="email"
              placeholder={targetEmail}
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={!isConfirmed || loading}
              onClick={handleDelete}
            >
              {loading ? "Eliminando…" : "Eliminar permanentemente"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
