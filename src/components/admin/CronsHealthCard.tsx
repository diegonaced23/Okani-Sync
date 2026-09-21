"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { Timer } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { AdminCard } from "./AdminCard";
import { StatusDot } from "./StatusDot";
import { cronHealth } from "@/lib/adminHealth";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelative } from "@/lib/utils";

/**
 * Salud de los trabajos programados.
 *
 * El veredicto de arriba («8 de 9 al día») es lo único que el admin necesita
 * leer cuando todo va bien; la lista está debajo para cuando no.
 *
 * El estado de cada job lo decide `cronHealth`, no esta tarjeta: el margen
 * sobre `everyMs` antes de dar algo por atrasado es una regla de negocio
 * testeada en `src/lib/__tests__/adminHealth.test.ts`, y duplicarla acá sería
 * la forma de que el panel y los tests acabaran discrepando.
 */
export function CronsHealthCard({ index = 0 }: { index?: number }) {
  const overview = useQuery(api.admin.getOverview);
  // Se fija al montar: Date.now() en el render rompería la pureza del componente.
  const [nowMs] = useState(() => Date.now());

  if (overview === undefined) {
    return (
      <AdminCard icon={Timer} tone="var(--os-cyan)" title="Trabajos programados" index={index}>
        <Skeleton className="h-28 rounded-2xl" />
      </AdminCard>
    );
  }

  const jobs = overview.crons.map((job) => ({
    ...job,
    status: cronHealth(job.last, job.everyMs, nowMs),
  }));
  const alDia = jobs.filter((j) => j.status === "ok").length;

  // Cuántos jobs solo se pueden vigilar por antigüedad. Se cuenta, no se
  // escribe «dos» a mano: si mañana un tercer job pasa a tener latido propio,
  // la nota al pie tiene que seguir siendo verdad sin que nadie la edite.
  const soloPorAntiguedad = jobs.filter((j) => j.selfReported).length;

  return (
    <AdminCard
      icon={Timer}
      tone="var(--os-cyan)"
      title="Trabajos programados"
      badge={
        <span
          className="text-[13px] font-bold text-foreground"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {alDia} de {jobs.length}
        </span>
      }
      index={index}
      footnote={
        soloPorAntiguedad > 0 ? (
          <>
            Los trabajos marcados «solo por antigüedad» ({soloPorAntiguedad} de {jobs.length})
            escriben su latido dentro de su propia transacción: si fallan, esa transacción
            revierte y la fila desaparece en lugar de marcarse como fallida. No dejan rastro de
            error — solo se les vigila porque su última ejecución envejece.
          </>
        ) : null
      }
    >
      <ul className="divide-y divide-border/60">
        {jobs.map((job) => (
          <li key={job.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-foreground">{job.label}</p>
              {/* La marca va en esta segunda línea y no junto al título: a 400 px
                  de ancho un título largo más la marca obligaría a truncar el
                  nombre del job, que es justo lo que hay que poder leer. */}
              <p className="truncate text-[11px] text-muted-foreground">
                {job.last ? formatRelative(job.last.finishedAt) : "nunca ha corrido"}
                {job.selfReported && " · solo por antigüedad"}
              </p>
              {/* El mensaje de error se trunca porque puede ser un stack entero;
                  `title` deja el texto completo al alcance del puntero. */}
              {job.last?.error && (
                <p className="truncate text-[11px] text-[var(--danger)]" title={job.last.error}>
                  {job.last.error}
                </p>
              )}
            </div>
            <StatusDot status={job.status} />
          </li>
        ))}
      </ul>
    </AdminCard>
  );
}
