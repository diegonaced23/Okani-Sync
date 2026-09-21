"use client";

import { useQuery } from "convex/react";
import { Activity } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { AdminCard } from "./AdminCard";
import { Skeleton } from "@/components/ui/skeleton";
import { formatStatCount } from "@/lib/adminHealth";
import { formatRelative } from "@/lib/utils";
import { STATS_COUNT_CAP, STATS_COUNT_CAP_LABEL } from "@/lib/constants";

/** Mismo bloque de cifra que usa UsersSummaryCard.tsx — misma forma visual en todo el panel. */
function Cifra({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <div className="rounded-[14px] bg-muted/40 px-3 py-2.5">
      <p
        className="text-[20px] font-bold leading-none text-foreground"
        style={{ fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}
      >
        {valor}
      </p>
      <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{etiqueta}</p>
    </div>
  );
}

/**
 * Panel de uso de UN usuario en su ficha admin.
 *
 * Decisión explícita del dueño del producto: el admin ve agregados y
 * metadatos, nunca datos financieros. Por eso esta tarjeta solo muestra
 * conteos (cuentas, movimientos, tarjetas, deudas, metas) y fechas — ni un
 * importe, saldo, descripción ni categoría.
 *
 * Lee `adminStats.getForUser`, una query dedicada a UN usuario — no
 * `listForAdmin`, que trae la fila de todos para pintar uno solo, que es
 * exactamente el defecto que esta tarea corrige en el resto de la ficha.
 */
export function UserUsageCard({
  clerkId,
  createdAt,
  lastSeenAt,
  index = 0,
}: {
  clerkId: string;
  createdAt: number;
  lastSeenAt: number | undefined;
  index?: number;
}) {
  const stats = useQuery(api.adminStats.getForUser, { clerkId });

  if (stats === undefined) {
    return (
      <AdminCard icon={Activity} tone="var(--os-cyan)" title="Uso" index={index}>
        <Skeleton className="h-20 rounded-2xl" />
      </AdminCard>
    );
  }

  // `null`: el usuario todavía no tiene fila en `userStats` (nunca corrió el
  // recálculo desde que existe) — se dice así en vez de mostrar ceros que
  // nunca se calcularon.
  const counts = stats?.counts;
  const capped = stats?.capped ?? false;

  // `capped` es un solo booleano por usuario que se enciende si CUALQUIER
  // tabla de las quince que cuenta `userStats` (no solo las cinco que se
  // muestran acá) llegó al tope de STATS_COUNT_CAP — por ejemplo
  // `cardInstallments`, que no tiene tarjeta propia en este panel. Cuando eso
  // pasa, las cinco cifras de abajo pueden verse "normales" (ninguna llegó al
  // tope) y sin embargo el usuario tiene una tabla topada: sin este aviso, el
  // admin no se entera de que el conjunto de datos de esa persona es más
  // grande de lo que cualquier cifra visible sugiere.
  const footnoteAntiguedad = stats
    ? `Contadores actualizados ${formatRelative(stats.computedAt)}.${
        capped
          ? ` Alguna tabla de este usuario llegó al tope de ${STATS_COUNT_CAP.toLocaleString("es-CO")}; los conteos topados se muestran como “${STATS_COUNT_CAP_LABEL}”.`
          : ""
      }`
    : "Los contadores todavía no se han calculado para este usuario.";

  return (
    <AdminCard icon={Activity} tone="var(--os-cyan)" title="Uso" index={index} footnote={footnoteAntiguedad}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Cifra valor={counts ? formatStatCount(counts.accounts ?? 0, capped) : "—"} etiqueta="Cuentas" />
        <Cifra valor={counts ? formatStatCount(counts.transactions ?? 0, capped) : "—"} etiqueta="Movimientos" />
        <Cifra valor={counts ? formatStatCount(counts.cards ?? 0, capped) : "—"} etiqueta="Tarjetas" />
        <Cifra valor={counts ? formatStatCount(counts.debts ?? 0, capped) : "—"} etiqueta="Deudas" />
        <Cifra valor={counts ? formatStatCount(counts.goals ?? 0, capped) : "—"} etiqueta="Metas" />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-muted-foreground">
        <span>Alta {formatRelative(createdAt)}</span>
        <span aria-hidden="true">·</span>
        {/* `lastSeenAt` sin definir se dice tal cual, nunca se sustituye por
            una fecha derivada del alta: sería afirmar una visita que nunca
            ocurrió (mismo criterio que UserRow.tsx). */}
        <span>{lastSeenAt === undefined ? "nunca ha entrado" : `Último acceso ${formatRelative(lastSeenAt)}`}</span>
      </div>
    </AdminCard>
  );
}
