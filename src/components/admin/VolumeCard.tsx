"use client";

import { useState } from "react";
import { useQuery, useAction } from "convex/react";
import { Database } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { AdminCard } from "./AdminCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatStatCount } from "@/lib/adminHealth";
import { formatRelative } from "@/lib/utils";
import { STATS_COUNT_CAP, STATS_COUNT_CAP_LABEL } from "@/lib/constants";

/** Mismo bloque de cifra que UsersSummaryCard.tsx / UserUsageCard.tsx — misma forma visual en todo el panel. */
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
 * Volumen de datos de toda la app: movimientos, cuentas y tarjetas.
 *
 * Lee `adminStats.getTotals`, que suma los contadores materializados por el
 * recálculo diario (`adminStats.recomputeAll`) — nunca cuenta filas al
 * vuelo. Por eso el dato tiene antigüedad y hay que decirla siempre: sin
 * ella, esta cifra es indistinguible de un conteo en vivo, y el día en que
 * el cron falla nadie lo notaría.
 */
export function VolumeCard({ index = 0 }: { index?: number }) {
  const data = useQuery(api.adminStats.getTotals);
  // Cuántos usuarios hay EN TOTAL, para poder decir sobre cuántos se calculó
  // la suma. Se lee de `listForAdmin` y no del propio `getTotals`: contar la
  // tabla `users` dentro de esa query suscribiría esta tarjeta a cada `patch`
  // de `lastSeenAt` de cualquiera. Otras tarjetas del panel ya están suscritas
  // a `listForAdmin`, así que Convex deduplica y no cuesta una lectura más.
  const users = useQuery(api.users.listForAdmin);
  const recomputeNow = useAction(api.adminStats.recomputeNow);
  const [recalculando, setRecalculando] = useState(false);

  if (data === undefined || users === undefined) {
    return (
      <AdminCard icon={Database} tone="var(--os-yellow)" title="Volumen de datos" index={index}>
        <Skeleton className="h-24 rounded-2xl" />
      </AdminCard>
    );
  }

  async function recalcular() {
    setRecalculando(true);
    try {
      // Renombrado para no ensombrecer el `users` de `listForAdmin` de arriba.
      const { users: lanzados } = await recomputeNow({});
      toast.success(`Recálculo lanzado para ${lanzados} ${lanzados === 1 ? "usuario" : "usuarios"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo recalcular");
    } finally {
      setRecalculando(false);
    }
  }

  const { totals, capped, computedAt, users: conContadores } = data;
  // `users` de `getTotals` son las FILAS de `userStats` que se sumaron, no los
  // usuarios que existen. Mientras el recálculo no haya alcanzado a todos, el
  // total es de una parte, y callarlo convertía «N movimientos» en una
  // afirmación sobre toda la app que no lo era.
  const parcial = conContadores < users.length;

  return (
    <AdminCard
      icon={Database}
      tone="var(--os-yellow)"
      title="Volumen de datos"
      index={index}
      footnote={
        capped
          ? `Algún usuario llegó al tope de ${STATS_COUNT_CAP.toLocaleString("es-CO")} filas contadas en alguna tabla: el total afectado se muestra como «${STATS_COUNT_CAP_LABEL}» en vez de una cifra que podría quedarse corta.`
          : "Los contadores se recalculan una vez al día con un cron. «Recalcular» fuerza el recálculo ahora mismo, para todos los usuarios."
      }
    >
      {/* `computedAt === undefined`: `userStats` no tiene ninguna fila (nunca
          corrió el recálculo). "0" en las tres cifras afirmaría un conteo que
          nunca se hizo, igual que en `UserUsageCard`, así que se dice "—". */}
      <div className="grid grid-cols-3 gap-2">
        <Cifra valor={computedAt === undefined ? "—" : formatStatCount(totals.transactions ?? 0, capped)} etiqueta="Movimientos" />
        <Cifra valor={computedAt === undefined ? "—" : formatStatCount(totals.accounts ?? 0, capped)} etiqueta="Cuentas" />
        <Cifra valor={computedAt === undefined ? "—" : formatStatCount(totals.cards ?? 0, capped)} etiqueta="Tarjetas" />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        {/* Obligatoria, no decorativa: ver la nota de arriba. */}
        <p className="text-[12px] text-muted-foreground">
          {computedAt === undefined
            ? "Todavía no se ha calculado ningún contador."
            : `Actualizado ${formatRelative(computedAt)}${
                parcial
                  ? ` · contando ${conContadores.toLocaleString("es-CO")} de ${users.length.toLocaleString("es-CO")} usuarios`
                  : ""
              }`}
        </p>
        <Button size="sm" variant="outline" disabled={recalculando} onClick={recalcular}>
          {recalculando ? "Recalculando…" : "Recalcular"}
        </Button>
      </div>
    </AdminCard>
  );
}
