"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { Users } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { AdminCard } from "./AdminCard";
import { activityStatus } from "@/lib/adminHealth";
import { Skeleton } from "@/components/ui/skeleton";

function Cifra({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  return (
    <div className="rounded-[14px] bg-muted/40 px-3 py-2.5">
      <p
        className="text-[20px] font-bold leading-none text-foreground"
        style={{ fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}
      >
        {valor.toLocaleString("es-CO")}
      </p>
      <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{etiqueta}</p>
    </div>
  );
}

/**
 * Resumen de las cuentas.
 *
 * OJO, este era el defecto de la tarjeta anterior: `users.active` es un
 * booleano de «cuenta habilitada» que solo cambia cuando un admin la
 * desactiva, NO una señal de uso. Una cuenta puede llevar un año sin entrar y
 * seguir con `active: true`. Por eso la cifra de gente que usa la app se
 * calcula desde `listForAdmin` con `activityStatus(lastSeenAt, transactionCount)` y
 * nunca desde `active`: son preguntas distintas y mezclarlas hacía que el
 * panel dijera «todos activos» de una app que nadie abría.
 *
 * Se lee todo de `listForAdmin` (y no de `getOverview.users`) para que las
 * cuatro cifras vengan de la MISMA foto: contarlas de dos queries que llegan
 * en momentos distintos deja al admin viendo totales que no cuadran entre sí.
 */
export function UsersSummaryCard({ index = 0 }: { index?: number }) {
  const users = useQuery(api.users.listForAdmin);
  // Se fija al montar: Date.now() en el render rompería la pureza del componente.
  const [nowMs] = useState(() => Date.now());

  if (users === undefined) {
    return (
      <AdminCard icon={Users} tone="var(--os-lime)" title="Cuentas" index={index}>
        <Skeleton className="h-20 rounded-2xl" />
      </AdminCard>
    );
  }

  const total = users.length;
  const estados = users.map((u) => activityStatus(u.lastSeenAt, u.transactionCount, nowMs));
  // Solo cuenta como "en uso" quien lo es de verdad. Quien no tiene ni fecha
  // de acceso ni contadores calculados no se suma ni aquí ni a las dormidas:
  // no se sabe, y meterlo en cualquiera de los dos montones haría que la
  // tarjeta afirmara algo que el propio panel declara no haber calculado.
  const enUso = estados.filter((e) => e === "active").length;
  const sinDatos = estados.filter((e) => e === "unknown").length;
  const desactivados = users.filter((u) => !u.active).length;
  const admins = users.filter((u) => u.role === "admin").length;

  return (
    <AdminCard
      icon={Users}
      tone="var(--os-lime)"
      title="Cuentas"
      badge={
        <span
          className="text-[13px] font-bold text-foreground"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {total.toLocaleString("es-CO")}
        </span>
      }
      index={index}
      footnote={`«En uso» cuenta a quien entró en los últimos 30 días, o a quien nunca abrió sesión desde que existe el registro pero sí dejó movimientos. «Desactivados» es otra cosa: son cuentas que un administrador deshabilitó.${
        sinDatos > 0
          ? ` De ${sinDatos === 1 ? "1 cuenta no se sabe" : `${sinDatos.toLocaleString("es-CO")} cuentas no se sabe`}: nunca abrieron sesión y sus contadores todavía no se han calculado, así que no se suman ni a «en uso» ni a las dormidas.`
          : ""
      }`}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Cifra valor={total} etiqueta="Cuentas" />
        <Cifra valor={enUso} etiqueta="En uso" />
        <Cifra valor={desactivados} etiqueta="Desactivadas" />
        <Cifra valor={admins} etiqueta="Administradores" />
      </div>
    </AdminCard>
  );
}
