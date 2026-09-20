"use client";

import { Mail, ShieldCheck, CalendarDays } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { tint } from "@/lib/ios";
import type { Doc } from "../../../convex/_generated/dataModel";
import { SettingsCard } from "./SettingsCard";

export function AccountInfoCard({ me, index }: { me: Doc<"users">; index?: number }) {
  // «Última actualización» ya no se muestra: era `updatedAt`, que cambia cada vez que se
  // toca cualquier preferencia —incluido el tema—, así que se leía como si la cuenta se
  // hubiera modificado sola. No decía nada que el usuario pudiera usar.
  const filas = [
    { icon: Mail, label: "Correo", value: me.email },
    { icon: CalendarDays, label: "Cuenta creada", value: formatDate(me.createdAt) },
  ];

  return (
    <SettingsCard
      icon={ShieldCheck}
      tone="var(--os-lime)"
      title="Datos de la cuenta"
      index={index}
      badge={
        me.role === "admin" ? (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide"
            style={{ background: tint("var(--os-violet)", 18), color: "var(--os-violet-text)" }}
          >
            Administrador
          </span>
        ) : undefined
      }
    >
      <dl className="space-y-0.5">
        {filas.map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-[14px] bg-[color-mix(in_oklch,var(--muted)_40%,transparent)] px-3 py-2.5"
          >
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <dt className="flex-1 text-xs text-muted-foreground">{label}</dt>
            <dd className="min-w-0 truncate text-[13px] font-semibold text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </SettingsCard>
  );
}
