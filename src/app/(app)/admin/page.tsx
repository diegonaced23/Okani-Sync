"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import {
  Users, UserCheck, ShieldCheck, ArrowLeftRight,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelative } from "@/lib/utils";

const AUDIT_ACTION_LABELS: Record<string, string> = {
  "user.created":           "Usuario creado",
  "user.updated":           "Usuario actualizado",
  "user.deleted":           "Usuario eliminado",
  "user.deactivated":       "Usuario desactivado",
  "user.role.changed":      "Rol cambiado",
  "user.password_reset":    "Link de acceso generado",
  "account.shared":         "Cuenta compartida",
  "account.share.revoked":  "Acceso revocado",
  "account.share.accepted": "Invitación aceptada",
  "account.share.rejected": "Invitación rechazada",
  "account.created":        "Cuenta creada",
  "account.deleted":        "Cuenta eliminada",
};

interface StatCardProps {
  label: string;
  value: number | undefined;
  icon: React.ElementType;
  loading: boolean;
}

function StatCard({ label, value, icon: Icon, loading }: StatCardProps) {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-5 gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      {loading ? (
        <Skeleton className="h-8 w-20 rounded-lg" />
      ) : (
        <p
          className="text-3xl font-bold text-foreground"
          style={{ fontVariantNumeric: "tabular-nums", letterSpacing: "-0.025em" }}
        >
          {value?.toLocaleString("es-CO") ?? "—"}
        </p>
      )}
    </div>
  );
}

export default function AdminDashboardPage() {
  const stats = useQuery(api.users.adminStats);
  const auditLogs = useQuery(api.auditLogs.listRecent, { limit: 10 });

  const statsLoading = stats === undefined;
  const logsLoading = auditLogs === undefined;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Panel administrativo</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Resumen de la actividad de la app
        </p>
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Usuarios"
          value={stats?.totalUsers}
          icon={Users}
          loading={statsLoading}
        />
        <StatCard
          label="Activos"
          value={stats?.activeUsers}
          icon={UserCheck}
          loading={statsLoading}
        />
        <StatCard
          label="Admins"
          value={stats?.adminCount}
          icon={ShieldCheck}
          loading={statsLoading}
        />
        <StatCard
          label="Transacciones"
          value={stats?.totalTransactions}
          icon={ArrowLeftRight}
          loading={statsLoading}
        />
      </section>

      {/* Actividad reciente */}
      <section className="rounded-xl bg-card border border-border overflow-hidden">
        <div className="px-4 py-2.5 bg-muted/50 border-b border-border">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Actividad reciente
          </h2>
        </div>
        {logsLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 rounded-lg" />
            ))}
          </div>
        ) : !auditLogs || auditLogs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">
            Sin actividad reciente.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {auditLogs.map((log) => (
              <li key={log._id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-foreground">
                    {AUDIT_ACTION_LABELS[log.action] ?? log.action}
                  </p>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatRelative(log.createdAt)}
                  </span>
                </div>
                {log.targetUserId && (
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
                    {log.targetUserId}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
