"use client";

import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Switch } from "@/components/ui/switch";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { haptic } from "@/lib/ios";
import {
  NOTIFICATION_PREF_KEYS,
  NOTIFICATION_PREF_LABELS,
  DEFAULT_NOTIFICATION_PREFS,
  type NotificationPrefs,
  type NotificationPrefKey,
} from "@/lib/notifications";
import { SettingsCard } from "./SettingsCard";

export function NotificationPrefsCard({
  prefs,
  index,
}: {
  prefs: NotificationPrefs | undefined;
  index?: number;
}) {
  const updatePrefs = useMutation(api.users.updateNotificationPrefs);
  const { status: pushStatus } = usePushNotifications();
  const actuales = { ...DEFAULT_NOTIFICATION_PREFS, ...prefs };

  async function handleToggle(key: NotificationPrefKey, value: boolean) {
    haptic();
    try {
      await updatePrefs({ prefs: { [key]: value } });
    } catch {
      toast.error("No se pudo guardar la preferencia");
    }
  }

  return (
    <SettingsCard
      icon={BellRing}
      tone="var(--os-magenta)"
      title="Qué quieres que te avisemos"
      index={index}
      description="Se aplica tanto al aviso dentro de la aplicación como a la notificación del teléfono."
      footnote={
        <>
          {/* Los switches NUNCA se deshabilitan: estas preferencias gobiernan también
              la notificación dentro de la app, así que siguen teniendo efecto aunque
              el push esté apagado en este dispositivo. */}
          {pushStatus !== "subscribed" && (
            <p>
              El push está desactivado en este dispositivo, pero estas preferencias siguen
              rigiendo los avisos que ves dentro de la aplicación.
            </p>
          )}
          <p className={pushStatus !== "subscribed" ? "mt-1.5" : undefined}>
            Los avisos sobre cuentas compartidas y cambios en tu acceso no se pueden
            silenciar: requieren que hagas algo.
          </p>
        </>
      }
    >
      <ul className="space-y-0.5">
        {NOTIFICATION_PREF_KEYS.map((key) => (
          <li
            key={key}
            className="flex items-center justify-between gap-4 rounded-[16px] bg-[color-mix(in_oklch,var(--muted)_40%,transparent)] px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-foreground">
                {NOTIFICATION_PREF_LABELS[key].title}
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
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
    </SettingsCard>
  );
}
