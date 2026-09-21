"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { History } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { AdminCard } from "./AdminCard";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AUDIT_ACTION_LABELS } from "@/lib/constants";
import { formatRelative } from "@/lib/utils";

const TODAS = "todas";

/**
 * Últimos 20 movimientos del audit log, con filtro por tipo de acción.
 *
 * El filtro es sobre lo YA traído (`listRecent` con `limit: 20`), no una
 * query nueva por tipo de acción: son 20 filas, filtrarlas en el cliente es
 * gratis y evita una segunda forma de leer la misma tabla.
 *
 * Defecto que corrige esta tarjeta: `log.targetUserId` falta en las acciones
 * sobre invitaciones (`user.invited`, `user.invite.revoked`) — el invitado
 * todavía no existe como usuario, así que no hay fila a la que apuntar. El
 * dato sí existe, en `log.metadata.email`, y se usa acá SOLO para mostrarlo;
 * nunca se escribe en `targetUserId`, que es semánticamente un id de usuario
 * y está indexado como tal (`by_target`).
 *
 * Reenviar el acceso a una invitación pendiente escribe el mismo
 * `user.invited` que darla de alta por primera vez (ver
 * `PendingInvitationsCard`), así que en este feed son indistinguibles. No se
 * inventa una etiqueta para diferenciarlos: la única honesta es la que ya
 * hay, y decir "invitación nueva" sería afirmar algo que no se sabe.
 */
export function RecentActivityCard({ index = 0 }: { index?: number }) {
  const logs = useQuery(api.auditLogs.listRecent, { limit: 20 });
  // Para traducir `userId` / `targetUserId` (clerkId) a nombre legible. Convex
  // deduplica en el cliente las suscripciones idénticas, así que compartir
  // esta query con otras tarjetas del panel no cuesta una lectura extra.
  const users = useQuery(api.users.listForAdmin);
  const [filtro, setFiltro] = useState(TODAS);

  if (logs === undefined) {
    return (
      <AdminCard icon={History} tone="var(--os-cyan)" title="Actividad reciente" index={index}>
        <Skeleton className="h-28 rounded-2xl" />
      </AdminCard>
    );
  }

  function nombreDe(clerkId: string | undefined): string | undefined {
    if (!clerkId) return undefined;
    // Mientras `users` carga no se enseña el clerkId crudo por un instante.
    if (users === undefined) return "…";
    const u = users.find((x) => x.clerkId === clerkId);
    return u?.name || u?.email || clerkId;
  }

  const accionesPresentes = Array.from(new Set(logs.map((l) => l.action))).sort((a, b) =>
    (AUDIT_ACTION_LABELS[a] ?? a).localeCompare(AUDIT_ACTION_LABELS[b] ?? b, "es")
  );

  const visibles = filtro === TODAS ? logs : logs.filter((l) => l.action === filtro);

  return (
    <AdminCard icon={History} tone="var(--os-cyan)" title="Actividad reciente" index={index}>
      {logs.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          Todavía no hay ninguna acción registrada en el audit log.
        </p>
      ) : (
        <div className="space-y-3">
          <Select value={filtro} onValueChange={(v) => { if (v) setFiltro(v); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS}>Todas las acciones</SelectItem>
              {accionesPresentes.map((a) => (
                <SelectItem key={a} value={a}>{AUDIT_ACTION_LABELS[a] ?? a}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {visibles.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              Ninguna de las últimas {logs.length} acciones es de ese tipo.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {visibles.map((log) => {
                const actor = nombreDe(log.userId);
                // Respaldo por email cuando no hay `targetUserId`: ver el
                // comentario de arriba.
                const target =
                  nombreDe(log.targetUserId) ??
                  (log.metadata as { email?: string } | undefined)?.email;

                return (
                  <li key={log._id} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-[13px] font-semibold text-foreground">
                        {AUDIT_ACTION_LABELS[log.action] ?? log.action}
                      </p>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatRelative(log.createdAt)}
                      </span>
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {actor ?? "…"}
                      {target ? ` → ${target}` : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </AdminCard>
  );
}
