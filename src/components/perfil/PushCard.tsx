"use client";

import { Switch } from "@/components/ui/switch";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Bell } from "lucide-react";
import { haptic } from "@/lib/ios";
import { SettingsCard } from "./SettingsCard";

const STATE_TEXT: Record<string, string> = {
  subscribed:   "Activas en este dispositivo",
  unsubscribed: "Desactivadas en este dispositivo",
  denied:       "Bloqueadas en el navegador",
  unsupported:  "Este dispositivo no las admite",
  loading:      "Verificando…",
};

export function PushCard({ index }: { index?: number }) {
  const { status, enable, disable } = usePushNotifications();
  const controllable = status !== "unsupported" && status !== "denied" && status !== "loading";

  return (
    <SettingsCard
      icon={Bell}
      tone="var(--os-orange)"
      title="Notificaciones push"
      index={index}
      description={STATE_TEXT[status] ?? ""}
      footnote={
        status === "denied"
          ? "Están bloqueadas para este sitio: hay que desbloquearlas en la configuración del navegador antes de poder activarlas aquí."
          : status === "unsubscribed"
            ? "Se activan por dispositivo. Encenderlas aquí no las enciende en tus otros teléfonos u ordenadores."
            : undefined
      }
    >
      {controllable && (
        <div className="flex items-center justify-between gap-4 rounded-[16px] bg-[color-mix(in_oklch,var(--muted)_40%,transparent)] px-3 py-2.5">
          <span className="text-[13px] font-semibold text-foreground">
            Avisar en este dispositivo
          </span>
          <Switch
            id="push-notifications-switch"
            aria-label="Notificaciones push en este dispositivo"
            checked={status === "subscribed"}
            onCheckedChange={(checked) => { haptic(); return checked ? enable() : disable(); }}
          />
        </div>
      )}
    </SettingsCard>
  );
}
