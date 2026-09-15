"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useTheme } from "next-themes";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { CURRENCIES } from "@/lib/constants";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { formatRelative } from "@/lib/utils";
import { Monitor, Sun, Moon, Bell, BellOff, LogOut, Smartphone, Globe } from "lucide-react";
import { authClient } from "@/lib/auth-client";

type SessionRow = NonNullable<
  Awaited<ReturnType<typeof authClient.listSessions>>["data"]
>[number];

export default function PerfilPage() {
  const router = useRouter();
  const { data: authSession, isPending: sessionPending } = authClient.useSession();
  const me = useQuery(api.users.getMe);
  const updateCurrency = useMutation(api.users.updateCurrency);
  const updateTheme    = useMutation(api.users.updateTheme);
  const updateName     = useMutation(api.users.updateName);
  const { theme, setTheme } = useTheme();
  const { status: pushStatus, enable: enablePush, disable: disablePush } = usePushNotifications();

  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [revokingSession, setRevokingSession] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);

  const loadSessions = useCallback(async () => {
    const { data } = await authClient.listSessions();
    setSessions(data ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, no hook expone la lista de sesiones de forma reactiva
    if (authSession) loadSessions();
  }, [authSession, loadSessions]);

  async function handleNameSave() {
    if (!newName.trim()) return;
    setSavingName(true);
    try {
      await updateName({ name: newName.trim() });
      toast.success("Nombre actualizado");
      setEditingName(false);
    } catch {
      toast.error("Error al actualizar el nombre");
    } finally {
      setSavingName(false);
    }
  }

  async function handleCurrencyChange(currency: string) {
    try {
      await updateCurrency({ currency });
      toast.success(`Moneda preferida: ${currency}`);
    } catch {
      toast.error("Error al actualizar moneda");
    }
  }

  async function handleThemeChange(t: string) {
    setTheme(t);
    try {
      await updateTheme({ theme: t as "light" | "dark" | "system" });
    } catch { /* no mostrar error por preferencia de UI */ }
  }

  async function handleRevokeSession(token: string) {
    setRevokingSession(token);
    try {
      await authClient.revokeSession({ token });
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
      await authClient.revokeOtherSessions();
      toast.success("Otras sesiones cerradas");
      await loadSessions();
    } catch {
      toast.error("Error al cerrar las otras sesiones");
    }
  }

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  if (sessionPending || me === undefined) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    );
  }

  const currentToken = authSession?.session?.token;
  const sortedSessions = sessions
    ? [...sessions].sort((a) => (a.token === currentToken ? -1 : 1))
    : null;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground">Perfil</h1>

      {/* Avatar y nombre */}
      <div className="rounded-xl bg-card border border-border p-5">
        <div className="flex items-center gap-4">
          <span
            aria-hidden
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-xl font-bold text-white"
            style={{ background: "linear-gradient(135deg, var(--os-magenta), oklch(0.32 0.14 20))" }}
          >
            {me?.name?.trim().charAt(0).toUpperCase() ?? "U"}
          </span>
          <div className="flex-1 min-w-0">
            {editingName ? (
              <div className="flex gap-2">
                <Input value={newName} onChange={(e) => setNewName(e.target.value)}
                  placeholder={me?.name ?? ""} className="h-8 text-sm" autoFocus />
                <Button size="sm" onClick={handleNameSave} disabled={savingName}>
                  {savingName ? "…" : "Guardar"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditingName(false)}>
                  Cancelar
                </Button>
              </div>
            ) : (
              <button type="button"
                onClick={() => { setNewName(me?.name ?? ""); setEditingName(true); }}
                className="text-lg font-bold text-foreground hover:underline text-left truncate block">
                {me?.name || "Sin nombre"}
              </button>
            )}
            <p className="text-sm text-muted-foreground truncate">
              {me?.email}
            </p>
          </div>
        </div>
      </div>

      {/* Moneda preferida */}
      <div className="rounded-xl bg-card border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Moneda preferida</h2>
        </div>
        <Select
          value={me?.currency ?? "COP"}
          onValueChange={(v) => { if (v) handleCurrencyChange(v); }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.symbol} {c.code} — {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Usada para consolidar el balance total en el dashboard.
        </p>
      </div>

      {/* Tema */}
      <div className="rounded-xl bg-card border border-border p-4 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Tema de la aplicación</h2>
        <div role="group" aria-label="Tema de la aplicación" className="grid grid-cols-3 gap-2">
          {[
            { value: "light", label: "Claro", icon: Sun },
            { value: "dark",  label: "Oscuro", icon: Moon },
            { value: "system", label: "Sistema", icon: Monitor },
          ].map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              aria-pressed={theme === value}
              onClick={() => handleThemeChange(value)}
              className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-sm font-medium transition-colors ${
                theme === value
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Notificaciones push */}
      <div className="rounded-xl bg-card border border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {pushStatus === "subscribed" ? (
              <Bell className="h-4 w-4 text-accent" />
            ) : (
              <BellOff className="h-4 w-4 text-muted-foreground" />
            )}
            <div>
              <p className="text-sm font-semibold text-foreground">Notificaciones push</p>
              <p className="text-xs text-muted-foreground">
                {pushStatus === "subscribed"   && "Activas en este dispositivo"}
                {pushStatus === "unsubscribed" && "Desactivadas"}
                {pushStatus === "denied"       && "Bloqueadas en el navegador"}
                {pushStatus === "unsupported"  && "No soportadas en este dispositivo"}
                {pushStatus === "loading"      && "Verificando…"}
              </p>
            </div>
          </div>
          {pushStatus !== "unsupported" && pushStatus !== "denied" && pushStatus !== "loading" && (
            <Switch
              id="push-notifications-switch"
              aria-label="Notificaciones push"
              checked={pushStatus === "subscribed"}
              onCheckedChange={(checked) => checked ? enablePush() : disablePush()}
            />
          )}
        </div>
        {pushStatus === "denied" && (
          <p className="text-xs text-warning mt-2">
            Ve a la configuración de tu navegador para desbloquear las notificaciones.
          </p>
        )}
      </div>

      <Separator />

      {/* Sesiones activas */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Sesiones activas ({sortedSessions?.length ?? 0})
          </h2>
          <button
            type="button"
            onClick={handleRevokeAllOther}
            className="text-xs text-danger hover:underline"
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
              {sortedSessions.map((session, idx) => (
                  <li key={session.id} className="flex items-center gap-3 px-4 py-3">
                    <Smartphone className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm text-foreground">
                          {idx === 0 ? "Este dispositivo" : `Sesión ${idx + 1}`}
                        </p>
                        {idx === 0 && (
                          <Badge variant="secondary" className="text-[10px]">Actual</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatRelative(new Date(session.updatedAt).getTime())}
                      </p>
                    </div>
                    {idx !== 0 && (
                      <button
                        type="button"
                        onClick={() => handleRevokeSession(session.token)}
                        disabled={revokingSession === session.token}
                        className="text-xs text-danger hover:underline disabled:opacity-50 shrink-0"
                      >
                        {revokingSession === session.token ? "Cerrando…" : "Cerrar"}
                      </button>
                    )}
                  </li>
                ))}
            </ul>
          )}
        </div>
      </section>

      <Separator />

      {/* Cerrar sesión */}
      <div className="flex justify-center pb-4">
        <Button
          variant="outline"
          className="gap-2 text-danger border-danger/30 hover:bg-danger/10"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </Button>
      </div>
    </div>
  );
}
