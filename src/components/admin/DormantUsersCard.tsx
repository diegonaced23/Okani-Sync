"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { Moon, ChevronRight } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { AdminCard } from "./AdminCard";
import { activityStatus, DORMANT_MS } from "@/lib/adminHealth";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelative } from "@/lib/utils";

const DIAS_DORMIDA = Math.round(DORMANT_MS / (24 * 60 * 60 * 1000));

/**
 * Cuántas cuentas se listan antes de resumir el resto.
 *
 * Una tarjeta que crece con el número de usuarios dormidos deja de ser algo
 * que se lee de un vistazo, que es el propósito del panel. Se muestran las que
 * llevan más tiempo fuera —las que más importan— y el resto se cuenta.
 */
const MAX_FILAS = 8;

/**
 * Cuentas que llevan mucho sin aparecer.
 *
 * El corte lo decide `activityStatus`, no esta tarjeta. Importa recordar que
 * «dormida» no es «desactivada»: estas cuentas siguen habilitadas y podrían
 * entrar mañana. Se muestran también las desactivadas, marcadas como tales,
 * porque esconderlas dejaría al admin con una lista que no cuadra con el total
 * de la tarjeta de Personas —ahí «en uso» tampoco distingue entre unas y
 * otras—; lo que hace falta es poder diferenciarlas de un vistazo, no que
 * desaparezcan.
 */
export function DormantUsersCard({ index = 0 }: { index?: number }) {
  const users = useQuery(api.users.listForAdmin);
  // Se fija al montar: Date.now() en el render rompería la pureza del componente.
  const [nowMs] = useState(() => Date.now());

  if (users === undefined) {
    return (
      <AdminCard icon={Moon} tone="var(--os-magenta)" title="Cuentas dormidas" index={index}>
        <Skeleton className="h-20 rounded-2xl" />
      </AdminCard>
    );
  }

  const estados = users.map((u) => ({
    u,
    estado: activityStatus(u.lastSeenAt, u.transactionCount, nowMs),
  }));
  // Quien nunca entró y no tiene contadores calculados NO entra en esta lista:
  // no se sabe si está dormido. Listarlo aquí sería acusar de inactividad a
  // partir de un cero que el panel mismo declara no haber calculado — y entre
  // el despliegue y el primer recálculo, eso era todo el mundo. Se cuentan
  // aparte y se dicen en la nota al pie.
  const sinDatos = estados.filter((e) => e.estado === "unknown").length;
  const dormidas = estados
    .filter((e) => e.estado === "dormant")
    .map((e) => e.u)
    // Primero quien lleva más tiempo fuera. Sin `lastSeenAt` va al principio:
    // no es que su última visita sea antigua, es que no hay ninguna.
    .sort((a, b) => (a.lastSeenAt ?? 0) - (b.lastSeenAt ?? 0));

  return (
    <AdminCard
      icon={Moon}
      tone="var(--os-magenta)"
      title="Cuentas dormidas"
      badge={
        <span
          className="text-[13px] font-bold text-foreground"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {dormidas.length}
        </span>
      }
      index={index}
      footnote={
        dormidas.length > 0 || sinDatos > 0
          ? `${
              dormidas.length > 0
                ? `Dormida significa sin entrar en ${DIAS_DORMIDA} días, o nunca haber entrado sin dejar ningún movimiento. Siguen habilitadas salvo que digan lo contrario.`
                : ""
            }${dormidas.length > 0 && sinDatos > 0 ? " " : ""}${
              sinDatos > 0
                ? `No se incluyen ${sinDatos === 1 ? "1 cuenta que nunca abrió sesión y cuyos contadores" : `${sinDatos.toLocaleString("es-CO")} cuentas que nunca abrieron sesión y cuyos contadores`} todavía no se han calculado: de esas no se sabe.`
                : ""
            }`
          : null
      }
    >
      {dormidas.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          Nadie lleva más de {DIAS_DORMIDA} días sin entrar.
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {dormidas.slice(0, MAX_FILAS).map((u) => (
            <li key={u.clerkId}>
              <Link
                href={`/admin/users/${u.clerkId}`}
                className="flex items-center gap-2 py-2.5 transition-opacity hover:opacity-70"
              >
                <div className="min-w-0 flex-1">
                  {/* El nombre se trunca y la marca no: si hay que sacrificar
                      caracteres, que sean los del nombre y no los de «esta
                      cuenta está deshabilitada». */}
                  <div className="flex min-w-0 items-center gap-1.5">
                    <p className="truncate text-[13px] font-semibold text-foreground">
                      {u.name || u.email}
                    </p>
                    {!u.active && (
                      <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        desactivada
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {u.email} ·{" "}
                    {/* `lastSeenAt` sin definir se dice tal cual: inventar una
                        fecha (la de alta, por ejemplo) sería afirmar una visita
                        que nunca ocurrió. */}
                    {u.lastSeenAt === undefined
                      ? "nunca ha entrado"
                      : `última vez ${formatRelative(u.lastSeenAt)}`}
                  </p>
                </div>
                <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
          {dormidas.length > MAX_FILAS && (
            <li className="pt-2.5 text-[12px] text-muted-foreground">
              y {dormidas.length - MAX_FILAS} más
            </li>
          )}
        </ul>
      )}
    </AdminCard>
  );
}
