"use client";

import { useState, useEffect, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatRelative } from "@/lib/utils";
import { Smartphone, Monitor } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { parseUserAgent, formatDevice } from "@/lib/userAgent";
import { SESSIONS_CHANGED_EVENT } from "@/lib/sessionEvents";

type SessionRow = NonNullable<
  Awaited<ReturnType<typeof authClient.listSessions>>["data"]
>[number];

export function SessionsCard() {
  const { data: authSession } = authClient.useSession();

  const [revokingSession, setRevokingSession] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);

  const loadSessions = useCallback(async () => {
    const { data, error } = await authClient.listSessions();
    if (error) {
      toast.error("No se pudieron cargar las sesiones");
      return;
    }
    setSessions(data ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, no hook expone la lista de sesiones de forma reactiva
    if (authSession) loadSessions();
  }, [authSession, loadSessions]);

  useEffect(() => {
    // `PasswordCard` dispara este evento tras revocar las otras sesiones tras
    // un cambio de contraseña, para que esta lista se refresque sin depender
    // de un recargado de página (no hay estado global entre ambas cards).
    function onSessionsChanged() {
      loadSessions();
    }
    window.addEventListener(SESSIONS_CHANGED_EVENT, onSessionsChanged);
    return () => window.removeEventListener(SESSIONS_CHANGED_EVENT, onSessionsChanged);
  }, [loadSessions]);

  async function handleRevokeSession(token: string) {
    setRevokingSession(token);
    try {
      const { error } = await authClient.revokeSession({ token });
      if (error) {
        toast.error(error.message ?? "Error al cerrar sesión");
        return;
      }
      toast.success("Sesión cerrada");
      await loadSessions();
    } catch {
      toast.error("Error al cerrar sesión");
    } finally {
      setRevokingSession(null);
    }
  }

  async function handleRevokeAllOther() {
    if ((sessions?.length ?? 0) <= 1) {
      toast.info("No hay otras sesiones activas");
      return;
    }
    try {
      const { error } = await authClient.revokeOtherSessions();
      if (error) {
        toast.error(error.message ?? "Error al cerrar las otras sesiones");
        return;
      }
      toast.success("Otras sesiones cerradas");
      await loadSessions();
    } catch {
      toast.error("Error al cerrar las otras sesiones");
    }
  }

  const currentToken = authSession?.session?.token;
  const sortedSessions = sessions
    ? [...sessions].sort(
        (a, b) =>
          Number(b.token === currentToken) - Number(a.token === currentToken)
      )
    : null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Sesiones activas ({sortedSessions?.length ?? 0})
        </h2>
        <button
          type="button"
          onClick={handleRevokeAllOther}
          className="touch-hit text-xs text-danger hover:underline"
        >
          Cerrar otras sesiones
        </button>
      </div>

      <div className="rounded-xl bg-card border border-border overflow-hidden">
        {!sortedSessions ? (
          <div className="p-4 space-y-2">
            {[1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
          </div>
        ) : sortedSessions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Sin sesiones activas.</p>
        ) : (
          <ul className="divide-y divide-border">
            {sortedSessions.map((session, idx) => {
              const device = parseUserAgent(session.userAgent);
              const DeviceIcon = device.isMobile ? Smartphone : Monitor;
              return (
                <li key={session.id} className="flex items-center gap-3 px-4 py-3">
                  <DeviceIcon className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm text-foreground truncate">{formatDevice(device)}</p>
                      {idx === 0 && (
                        <Badge variant="secondary" className="text-[10px]">Actual</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {formatRelative(new Date(session.updatedAt).getTime())}
                      {/* `ipAddress` puede venir vacío: Better Auth lo deriva de cabeceras
                          tipo x-forwarded-for y no está verificado que Convex las reenvíe.
                          Cuando falta no se escribe nada, en vez de un "IP desconocida". */}
                      {session.ipAddress ? ` · ${session.ipAddress}` : ""}
                    </p>
                  </div>
                  {idx !== 0 && (
                    <button
                      type="button"
                      onClick={() => handleRevokeSession(session.token)}
                      disabled={revokingSession === session.token}
                      className="touch-hit text-xs text-danger hover:underline disabled:opacity-50 shrink-0"
                    >
                      {revokingSession === session.token ? "Cerrando…" : "Cerrar"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
