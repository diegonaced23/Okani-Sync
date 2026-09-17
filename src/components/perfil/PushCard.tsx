"use client";

import { Switch } from "@/components/ui/switch";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Bell, BellOff } from "lucide-react";

export function PushCard() {
  const { status: pushStatus, enable: enablePush, disable: disablePush } = usePushNotifications();

  return (
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
  );
}
