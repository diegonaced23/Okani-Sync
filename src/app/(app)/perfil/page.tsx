"use client";

import { useUser, useSessionList, useClerk } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useTheme } from "next-themes";
import { useState } from "react";
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
import { UserButton } from "@clerk/nextjs";

export default function PerfilPage() {
  const { user, isLoaded } = useUser();
  const { sessions } = useSessionList();
  const { signOut } = useClerk();
  const me = useQuery(api.users.getMe);
  const updateCurrency = useMutation(api.users.updateCurrency);
  const updateTheme    = useMutation(api.users.updateTheme);
  const { theme, setTheme } = useTheme();
  const { status: pushStatus, enable: enablePush, disable: disablePush } = usePushNotifications();

  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [revokingSession, setRevokingSession] = useState<string | null>(null);

  async function handleNameSave() {
    if (!newName.trim() || !user) return;
    setSavingName(true);
    try {
      const parts = newName.trim().split(" ");
      await user.update({ firstName: parts[0], lastName: parts.slice(1).join(" ") || undefined });
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

  type RevokableSession = { id: string; status: string; revoke: () => Promise<void> };

  async function handleRevokeSession(sessionId: string) {
    const session = sessions?.find((s) => s.id === sessionId) as unknown as RevokableSession | undefined;
    if (!session) return;
    setRevokingSession(sessionId);
    try {
      await session.revoke();
      toast.success("Sesión cerrada");
    } catch {
      toast.error("Error al cerrar sesión");
    } finally {
      setRevokingSession(null);
    }
  }

  async function handleRevokeAllOther() {
    const others = (sessions ?? []).filter(
      (s) => s.status === "active" && s.id !== sessions?.[0]?.id
    ) as unknown as RevokableSession[];
    if (!others.length) { toast.info("No hay otras sesiones activas"); return; }
    await Promise.all(others.map((s) => s.revoke()));
    toast.success("Otras sesiones cerradas");
  }

  if (!isLoaded) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground">Perfil</h1>

      {/* Avatar y nombre */}
      <div className="rounded-xl bg-card border border-border p-5">
        <div className="flex items-center gap-4">
          <UserButton appearance={{ elements: { avatarBox: "h-14 w-14" } }} />
          <div className="flex-1 min-w-0">
            {editingName ? (
              <div className="flex gap-2">
                <Input value={newName} onChange={(e) => setNewName(e.target.value)}
                  placeholder={user?.fullName ?? ""} className="h-8 text-sm" autoFocus />
                <Button size="sm" onClick={handleNameSave} disabled={savingName}>
                  {savingName ? "…" : "Guardar"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditingName(false)}>
                  Cancelar
                </Button>
              </div>
            ) : (
              <button type="button"
                onClick={() => { setNewName(user?.fullName ?? ""); setEditingName(true); }}
                className="text-lg font-bold text-foreground hover:underline text-left truncate block">
                {user?.fullName ?? "Sin nombre"}
              </button>
            )}
            <p className="text-sm text-muted-foreground truncate">
              {user?.primaryEmailAddress?.emailAddress}
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
            Sesiones activas ({sessions?.filter(s => s.status === "active").length ?? 0})
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
          {!sessions ? (
            <div className="p-4 space-y-2">
              {[1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : sessions.filter(s => s.status === "active").length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Sin sesiones activas.</p>
          ) : (
            <ul className="divide-y divide-border">
              {sessions
                .filter((s) => s.status === "active")
                .map((session, idx) => (
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
                        {session.lastActiveAt
                          ? formatRelative(new Date(session.lastActiveAt).getTime())
                          : "Última actividad desconocida"}
                      </p>
                    </div>
                    {idx !== 0 && (
                      <button
                        type="button"
                        onClick={() => handleRevokeSession(session.id)}
                        disabled={revokingSession === session.id}
                        className="text-xs text-danger hover:underline disabled:opacity-50 shrink-0"
                      >
                        {revokingSession === session.id ? "Cerrando…" : "Cerrar"}
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
          onClick={() => signOut({ redirectUrl: "/sign-in" })}
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </Button>
      </div>
    </div>
  );
}
