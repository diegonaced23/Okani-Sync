"use client";

import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { ClipboardList, TriangleAlert } from "lucide-react";
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
import { REGISTRATION_SOURCES } from "@/lib/constants";

function sourceLabel(value: string) {
  return REGISTRATION_SOURCES.find((s) => s.value === value)?.label ?? value;
}

/**
 * Solicitudes del formulario público, a la espera de decisión.
 *
 * Aprobar NO crea el usuario: emite una invitación y manda el acceso. Rechazar
 * es silencioso —el solicitante no recibe nada— y solo deja el registro de la
 * decisión.
 */
export function PendingRequestsCard({ index = 0 }: { index?: number }) {
  const requests = useQuery(api.registrationRequests.listPending);
  const reject = useMutation(api.registrationRequests.reject);
  const approve = useAction(api.registrationRequests.approve);

  const [ocupada, setOcupada] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [porRechazar, setPorRechazar] = useState<
    { id: Id<"registrationRequests">; email: string } | null
  >(null);

  async function aprobar(id: Id<"registrationRequests">, email: string) {
    setOcupada(id);
    try {
      await approve({ requestId: id });
      toast.success(`Acceso enviado a ${email}`);
    } catch (err) {
      toast.error(errorMessage(err, "No se pudo aprobar la solicitud"));
    } finally {
      setOcupada(null);
    }
  }

  async function confirmarRechazo() {
    if (!porRechazar) return;
    const { id } = porRechazar;
    setPorRechazar(null);
    setOcupada(id);
    try {
      await reject({ requestId: id });
      toast.success("Solicitud rechazada");
    } catch (err) {
      toast.error(errorMessage(err, "No se pudo rechazar"));
    } finally {
      setOcupada(null);
    }
  }

  if (requests === undefined) {
    return (
      <AdminCard icon={ClipboardList} tone="var(--os-cyan)" title="Solicitudes de registro" index={index}>
        <Skeleton className="h-20 rounded-2xl" />
      </AdminCard>
    );
  }

  return (
    <AdminCard
      icon={ClipboardList}
      tone="var(--os-cyan)"
      title="Solicitudes de registro"
      badge={
        <span
          className="text-[13px] font-bold text-foreground"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {requests.length}
        </span>
      }
      index={index}
      footnote={
        requests.length > 0
          ? "Aprobar emite una invitación y envía el enlace de acceso. Rechazar no le avisa a nadie."
          : null
      }
    >
      {requests.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          No hay solicitudes pendientes de revisar.
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {requests.map((r) => {
            const desplegada = abierta === r.id;
            return (
              <li key={r.id} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <button
                    type="button"
                    onClick={() => setAbierta(desplegada ? null : r.id)}
                    aria-expanded={desplegada}
                    className="min-w-0 flex-1 rounded-sm text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    {/* <span className="block"> y no <p>: un <p> dentro de un
                        <button> es anidado invalido — un button solo admite
                        contenido de frase. */}
                    <span className="block truncate text-[13px] font-semibold text-foreground">
                      {r.name}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {r.email} · {formatRelative(r.createdAt)}
                    </span>
                  </button>
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      size="sm"
                      disabled={ocupada === r.id || r.alreadyRegistered}
                      onClick={() => aprobar(r.id, r.email)}
                    >
                      Aprobar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={ocupada === r.id}
                      onClick={() => setPorRechazar({ id: r.id, email: r.email })}
                    >
                      Rechazar
                    </Button>
                  </div>
                </div>

                {r.alreadyRegistered && (
                  <p className="mt-2 flex items-start gap-1.5 text-[11px] text-warning-text">
                    <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                    Ese correo ya tiene una cuenta. No se puede aprobar: hazlo desde el
                    usuario existente si hace falta.
                  </p>
                )}

                {desplegada && (
                  <dl className="os-enter mt-2.5 space-y-1 text-[12px]">
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-muted-foreground">Ciudad</dt>
                      <dd className="text-foreground">{r.city}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-muted-foreground">Nos conoció por</dt>
                      <dd className="text-foreground">{sourceLabel(r.source)}</dd>
                    </div>
                    {r.referredBy && (
                      <div className="flex gap-2">
                        <dt className="shrink-0 text-muted-foreground">Lo refirió</dt>
                        <dd className="text-foreground">{r.referredBy}</dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-muted-foreground">Motivo</dt>
                      <dd className="mt-0.5 whitespace-pre-wrap text-foreground">{r.note}</dd>
                    </div>
                  </dl>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog open={porRechazar !== null} onOpenChange={(o) => !o && setPorRechazar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Rechazar la solicitud?</AlertDialogTitle>
            <AlertDialogDescription>
              {porRechazar?.email} no recibirá ningún aviso: el rechazo es silencioso.
              La solicitud se queda en el historial.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarRechazo}>Rechazar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminCard>
  );
}
