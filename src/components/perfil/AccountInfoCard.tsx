"use client";

import { Badge } from "@/components/ui/badge";
import { Mail, Shield, CalendarDays } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { Doc } from "../../../convex/_generated/dataModel";

export function AccountInfoCard({ me }: { me: Doc<"users"> }) {
  const filas = [
    { icon: Mail, label: "Correo", value: me.email },
    { icon: CalendarDays, label: "Cuenta creada", value: formatDate(me.createdAt) },
    { icon: CalendarDays, label: "Última actualización", value: formatDate(me.updatedAt) },
  ];

  return (
    <div className="rounded-xl bg-card border border-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-foreground">Datos de la cuenta</h2>
        {me.role === "admin" && <Badge variant="secondary" className="text-[10px]">Administrador</Badge>}
      </div>
      <dl className="divide-y divide-border">
        {filas.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-3 py-2.5">
            <Icon className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
            <dt className="text-sm text-muted-foreground flex-1">{label}</dt>
            <dd className="text-sm text-foreground truncate">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
