"use client";

import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Bell, BellOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export function PushSubscriptionBanner() {
  const { status, enable, disable } = usePushNotifications();
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);

  // No mostrar si no aplica
  if (
    dismissed ||
    status === "loading" ||
    status === "unsupported" ||
    status === "denied" ||
    status === "subscribed"
  ) {
    return null;
  }

  async function handleEnable() {
    setLoading(true);
    await enable();
    setLoading(false);
  }

  return (
    <div className="mx-4 mb-4 rounded-xl bg-accent/10 border border-accent/20 p-4 lg:mx-0">
      <div className="flex items-start gap-3">
        <Bell className="h-5 w-5 text-accent shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            Activa las notificaciones
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Recibe alertas de presupuestos excedidos, cuotas próximas y deudas vencidas.
            {typeof window !== "undefined" && /iphone|ipad/i.test(navigator.userAgent) && (
              <span className="block mt-1 text-warning">
                En iOS debes instalar la app (Agregar a inicio) para recibir notificaciones push.
              </span>
            )}
          </p>
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={handleEnable} disabled={loading} className="gap-1.5">
              <Bell className="h-3.5 w-3.5" />
              {loading ? "Activando…" : "Activar"}
            </Button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors shrink-0"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
