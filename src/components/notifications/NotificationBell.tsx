"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const TYPE_ICONS: Record<string, string> = {
  presupuesto_alerta:    "⚠️",
  presupuesto_excedido:  "🚨",
  cuota_proxima:         "⏰",
  deuda_vencida:         "🔴",
  pago_tarjeta_proximo:  "💳",
  cuenta_compartida:     "🤝",
  share_aceptado:        "✅",
  sistema:               "📢",
};

export function NotificationBell() {
  const { isSignedIn } = useAuth();
  const [open, setOpen] = useState(false);
  const count    = useQuery(api.notifications.unreadCount, isSignedIn ? {} : "skip");
  const recent   = useQuery(api.notifications.listRecent, isSignedIn ? { limit: 8 } : "skip");
  const markRead  = useMutation(api.notifications.markAsRead);
  const markAllRead = useMutation(api.notifications.markAllAsRead);

  const hasUnread = (count ?? 0) > 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notificaciones${hasUnread ? ` (${count} sin leer)` : ""}`}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <Bell className="h-5 w-5" />
        {hasUnread && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[9px] font-bold text-white">
            {(count ?? 0) > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Overlay para cerrar */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />

          {/* Panel de notificaciones */}
          <div className="absolute right-0 top-10 z-50 w-80 rounded-xl border border-border bg-card shadow-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Notificaciones</h3>
              {hasUnread && (
                <button
                  type="button"
                  onClick={() => markAllRead()}
                  className="text-xs text-muted-foreground hover:text-accent transition-colors"
                >
                  Marcar todas como leídas
                </button>
              )}
            </div>

            {/* Lista */}
            <div className="max-h-80 overflow-y-auto">
              {(recent ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Sin notificaciones.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {(recent ?? []).map((n) => (
                    <li key={n._id}>
                      <button
                        type="button"
                        onClick={() => markRead({ notificationId: n._id })}
                        className={cn(
                          "w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors",
                          !n.read && "bg-accent/5"
                        )}
                      >
                        <div className="flex items-start gap-2.5">
                          <span className="text-base shrink-0 mt-0.5">
                            {TYPE_ICONS[n.type] ?? "📢"}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-semibold text-foreground truncate">
                                {n.title}
                              </p>
                              {!n.read && (
                                <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {n.message}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {formatRelative(n.createdAt)}
                            </p>
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
