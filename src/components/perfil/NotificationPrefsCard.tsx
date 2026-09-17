"use client";

import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Switch } from "@/components/ui/switch";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import {
  NOTIFICATION_PREF_KEYS,
  NOTIFICATION_PREF_LABELS,
  DEFAULT_NOTIFICATION_PREFS,
  type NotificationPrefs,
  type NotificationPrefKey,
} from "@/lib/notifications";

export function NotificationPrefsCard({ prefs }: { prefs: NotificationPrefs | undefined }) {
  const updatePrefs = useMutation(api.users.updateNotificationPrefs);
  const { status: pushStatus } = usePushNotifications();
  const actuales = { ...DEFAULT_NOTIFICATION_PREFS, ...prefs };

  async function handleToggle(key: NotificationPrefKey, value: boolean) {
    try {
      await updatePrefs({ prefs: { [key]: value } });
    } catch {
      toast.error("No se pudo guardar la preferencia");
    }
  }

  return (
    <div className="rounded-xl bg-card border border-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <BellRing className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Qué quieres que te avisemos</h2>
      </div>

      <ul className="divide-y divide-border">
        {NOTIFICATION_PREF_KEYS.map((key) => (
          <li key={key} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {NOTIFICATION_PREF_LABELS[key].title}
              </p>
              <p className="text-xs text-muted-foreground">
                {NOTIFICATION_PREF_LABELS[key].description}
              </p>
            </div>
            <Switch
              id={`pref-${key}`}
              aria-label={NOTIFICATION_PREF_LABELS[key].title}
              checked={actuales[key]}
              onCheckedChange={(v) => handleToggle(key, v)}
            />
          </li>
        ))}
      </ul>

      {/* Los switches NUNCA se deshabilitan: estas preferencias gobiernan
          también la notificación dentro de la app, así que siguen teniendo
          efecto aunque el push esté apagado en este dispositivo. */}
      {pushStatus !== "subscribed" && (
        <p className="text-xs text-muted-foreground">
          El push está desactivado en este dispositivo. Estas preferencias
          siguen aplicando a las notificaciones dentro de la app.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Los avisos sobre cuentas compartidas y cambios en tu acceso no se pueden
        silenciar: requieren que hagas algo.
      </p>
    </div>
  );
}
