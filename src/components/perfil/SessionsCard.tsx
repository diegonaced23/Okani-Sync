"use client";

import { useState, useEffect, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { formatRelative } from "@/lib/utils";
import { Smartphone, Monitor, MonitorSmartphone } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { parseUserAgent, formatDevice } from "@/lib/userAgent";
import { SESSIONS_CHANGED_EVENT } from "@/lib/sessionEvents";
import { haptic, tint } from "@/lib/ios";
import { SettingsCard } from "./SettingsCard";

type SessionRow = NonNullable<
  Awaited<ReturnType<typeof authClient.listSessions>>["data"]
>[number];

export function SessionsCard({ index }: { index?: number }) {
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
    haptic();
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

  const others = (sortedSessions?.length ?? 0) - 1;

  return (
    <SettingsCard
      icon={MonitorSmartphone}
      tone="var(--os-cyan)"
      title={`Sesiones activas${sortedSessions ? ` (${sortedSessions.length})` : ""}`}
      index={index}
      description="Cada navegador o dispositivo donde tu cuenta sigue abierta. Si ves uno que no reconoces, ciérralo y cambia la contraseña."
      badge={
        // Antes el botón estaba siempre activo y respondía con un aviso cuando no
        // había otras sesiones: ahora directamente no se ofrece.
        others > 0 ? (
          <button
            type="button"
            onClick={handleRevokeAllOther}
            className="touch-hit shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold text-danger transition-colors active:bg-danger/10"
          >
            Cerrar las otras
          </button>
        ) : undefined
      }
    >
      {!sortedSessions ? (
        <div className="space-y-1.5">
          {[1, 2].map((i) => <Skeleton key={i} className="h-[58px] rounded-[16px]" />)}
        </div>
      ) : sortedSessions.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Sin sesiones activas.</p>
      ) : (
        <ul className="space-y-0.5">
          {sortedSessions.map((session, idx) => {
            const device = parseUserAgent(session.userAgent);
            const DeviceIcon = device.isMobile ? Smartphone : Monitor;
            const isCurrent = idx === 0;
            return (
              <li
                key={session.id}
                className="flex items-center gap-3 rounded-[16px] bg-[color-mix(in_oklch,var(--muted)_40%,transparent)] px-3 py-2.5"
              >
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  style={
                    isCurrent
                      ? { background: tint("var(--os-lime)", 18), color: "var(--os-lime-text)" }
                      : { background: "color-mix(in oklch, var(--muted-foreground) 12%, transparent)", color: "var(--muted-foreground)" }
                  }
                >
                  <DeviceIcon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-[13px] font-semibold text-foreground">
                      {formatDevice(device)}
                    </p>
                    {isCurrent && (
                      <span
                        className="shrink-0 rounded-full px-1.5 text-[10px] font-extrabold"
                        style={{ background: tint("var(--os-lime)", 20), color: "var(--os-lime-text)" }}
                      >
                        Este
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {formatRelative(new Date(session.updatedAt).getTime())}
                    {/* `ipAddress` puede venir vacío: Better Auth lo deriva de cabeceras
                        tipo x-forwarded-for y no está verificado que Convex las reenvíe.
                        Cuando falta no se escribe nada, en vez de un "IP desconocida". */}
                    {session.ipAddress ? ` · ${session.ipAddress}` : ""}
                  </p>
                </div>
                {!isCurrent && (
                  <button
                    type="button"
                    onClick={() => { haptic(); handleRevokeSession(session.token); }}
                    disabled={revokingSession === session.token}
                    className="touch-hit shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold text-danger transition-colors active:bg-danger/10 disabled:opacity-50"
                  >
                    {revokingSession === session.token ? "Cerrando…" : "Cerrar"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SettingsCard>
  );
}
