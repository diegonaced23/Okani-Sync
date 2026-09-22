"use client";

import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { MailPlus } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AdminCard } from "./AdminCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { formatRelative } from "@/lib/utils";
import { errorMessage } from "@/lib/errorMessage";

const ROL_LABEL: Record<string, string> = {
  admin: "Administrador",
  user: "Usuario",
};

/**
 * Invitaciones que siguen sin usarse.
 *
 * Reenviar el acceso NO puede usar `api.actions.adminUsers.sendAccessEmail`:
 * esa acción recibe un `targetClerkId` y busca la fila de `users`, que para
 * una invitación pendiente todavía no existe —justamente por eso está
 * pendiente—. Se usa `createByAdmin` con el mismo correo y rol, que es
 * idempotente: `invitations.createFromAdmin` devuelve la invitación pendiente
 * que ya hay en vez de insertar otra, así que el único efecto real es volver a
 * mandar el magic link. (El rol de la invitación existente manda: si se
 * reenvía con otro distinto, se ignora. Acá siempre se reenvía con el suyo.)
 */
export function PendingInvitationsCard({ index = 0 }: { index?: number }) {
  const invitations = useQuery(api.admin.listPendingInvitations);
  // Para traducir `invitedBy` (un clerkId) a un nombre legible. Convex deduplica
  // las suscripciones idénticas en el cliente, así que compartir esta query con
  // las otras tarjetas no cuesta una lectura extra.
  const users = useQuery(api.users.listForAdmin);

  const revoke = useMutation(api.invitations.revoke);
  const createByAdmin = useAction(api.actions.adminUsers.createByAdmin);

  const [ocupada, setOcupada] = useState<string | null>(null);
  const [porRevocar, setPorRevocar] = useState<
    { id: Id<"invitations">; email: string } | null
  >(null);

  function nombreDeAdmin(clerkId: string) {
    // Mientras `users` carga no se enseña el clerkId crudo por un instante:
    // un identificador opaco parpadeando donde luego habrá un nombre se lee
    // como un error, no como una carga.
    if (users === undefined) return "…";
    const admin = users.find((u) => u.clerkId === clerkId);
    return admin?.name || admin?.email || clerkId;
  }

  async function reenviar(inv: { id: string; email: string; role: "user" | "admin" }) {
    setOcupada(inv.id);
    try {
      await createByAdmin({ email: inv.email, role: inv.role });
      toast.success("Enlace de acceso reenviado por correo");
    } catch (err) {
      toast.error(errorMessage(err, "No se pudo reenviar el acceso"));
    } finally {
      setOcupada(null);
    }
  }

  async function confirmarRevocar() {
    if (!porRevocar) return;
    const { id } = porRevocar;
    setPorRevocar(null);
    setOcupada(id);
    try {
      await revoke({ invitationId: id });
      toast.success("Invitación revocada");
    } catch (err) {
      toast.error(errorMessage(err, "No se pudo revocar"));
    } finally {
      setOcupada(null);
    }
  }

  if (invitations === undefined) {
    return (
      <AdminCard icon={MailPlus} tone="var(--os-violet)" title="Invitaciones pendientes" index={index}>
        <Skeleton className="h-20 rounded-2xl" />
      </AdminCard>
    );
  }

  return (
    <AdminCard
      icon={MailPlus}
      tone="var(--os-violet)"
      title="Invitaciones pendientes"
      badge={
        <span
          className="text-[13px] font-bold text-foreground"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {invitations.length}
        </span>
      }
      index={index}
      footnote={
        invitations.length > 0
          ? "Una invitación pendiente es el único camino de alta: mientras no se use, esa persona no puede entrar."
          : null
      }
    >
      {invitations.length === 0 ? (
        // No se afirma «todo el mundo invitado ya entró»: una invitación
        // revocada también se borra de la tabla, así que cero pendientes no
        // prueba que nadie se quedara fuera.
        <p className="text-[13px] text-muted-foreground">
          No hay invitaciones pendientes: nadie está esperando acceso.
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {invitations.map((inv) => (
            <li key={inv.id} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-foreground">{inv.email}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {ROL_LABEL[inv.role] ?? inv.role} · invitó {nombreDeAdmin(inv.invitedBy)} ·{" "}
                    {formatRelative(inv.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={ocupada === inv.id}
                    onClick={() => reenviar(inv)}
                  >
                    Reenviar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={ocupada === inv.id}
                    onClick={() => setPorRevocar({ id: inv.id, email: inv.email })}
                  >
                    Revocar
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={porRevocar !== null} onOpenChange={(o) => !o && setPorRevocar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Revocar la invitación?</AlertDialogTitle>
            <AlertDialogDescription>
              {porRevocar?.email} dejará de poder entrar. Se puede volver a invitar más adelante,
              pero con una invitación nueva.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarRevocar}>Revocar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminCard>
  );
}
