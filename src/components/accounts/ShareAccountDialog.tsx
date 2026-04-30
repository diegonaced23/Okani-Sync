"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface ShareAccountDialogProps {
  accountId: Id<"accounts">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PERMISSION_LABELS = {
  viewer: "Solo ver (saldos y movimientos)",
  editor: "Editor (crear transacciones)",
  admin: "Admin (compartir y editar cuenta)",
};

export function ShareAccountDialog({
  accountId,
  open,
  onOpenChange,
}: ShareAccountDialogProps) {
  const shareAccount = useMutation(api.accountShares.share);
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<"viewer" | "editor" | "admin">("viewer");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      await shareAccount({ accountId, email: email.trim(), permission });
      toast.success(`Invitación enviada a ${email}`);
      setEmail("");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al compartir");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Compartir cuenta</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="share-email">Correo del usuario</Label>
            <Input
              id="share-email"
              type="email"
              placeholder="usuario@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Solo puedes invitar a usuarios que ya tengan cuenta en Okany Sync.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Nivel de acceso</Label>
            <Select
              value={permission}
              onValueChange={(v) => { if (v) setPermission(v as typeof permission); }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PERMISSION_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? "Enviando…" : "Enviar invitación"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
