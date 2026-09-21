"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { ArrowLeftRight } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { AdminCard } from "./AdminCard";
import { StatusDot, STATUS_TONE, STATUS_TEXT_TONE } from "./StatusDot";
import { rateFreshness, RATE_OK_MS } from "@/lib/adminHealth";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelative } from "@/lib/utils";
import { tint } from "@/lib/ios";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Cuántos pares rancios se nombran antes de resumir el resto con «y N más». */
const MAX_PARES_NOMBRADOS = 3;

/**
 * Salud de las tasas de cambio.
 *
 * Deliberadamente NO mira el latido del cron `fetchExchangeRates`: esa acción
 * nunca lanza —cada par que falla se registra con `console.error` y el bucle
 * sigue—, así que su fila de `cronRuns` queda en `ok: true` aunque no se haya
 * refrescado ni un solo par. El único dato honesto es el `updatedAt` de cada
 * par.
 *
 * Por eso `getOverview` devuelve los pares crudos y TODO el estado se deriva
 * acá, con un único `Date.now()` del cliente. Ese reloj se CONGELA al montar
 * (`useState(() => Date.now())`, porque llamarlo en el render rompería la
 * pureza del componente): lo que garantiza es que el punto de estado y el
 * conteo de pares rancios salgan del mismo instante y del mismo dato, así que
 * no pueden contradecirse entre sí. Lo que NO garantiza es frescura — el
 * reloj congelado no avanza y `formatRelative` sí usa un `Date.now()` vivo,
 * de modo que la fecha relativa y el estado se separan con el tiempo y la
 * tarjeta envejece hasta que se recarga la página. Si en cambio el conteo de
 * rancios se calculara en el servidor, se congelaría de otra forma —una query
 * de Convex se reevalúa cuando cambian los documentos que leyó, no cuando pasa
 * el tiempo— y al morir el cron el panel mostraría el punto en rojo junto a
 * «6 de 6 pares al día», que es exactamente lo que esta tarjeta existe para
 * evitar.
 *
 * El umbral no se decide acá: `rateFreshness` y `RATE_OK_MS` son los únicos
 * dueños de la regla, y el conteo por par usa el mismo corte que el estado.
 */
export function RatesHealthCard({ index = 0 }: { index?: number }) {
  const overview = useQuery(api.admin.getOverview);
  // Se fija al montar: Date.now() en el render rompería la pureza del componente.
  const [nowMs] = useState(() => Date.now());

  if (overview === undefined) {
    return (
      <AdminCard icon={ArrowLeftRight} tone="var(--os-orange)" title="Tasas de cambio" index={index}>
        <Skeleton className="h-16 rounded-2xl" />
      </AdminCard>
    );
  }

  const pares = overview.rates.pairs;
  const total = pares.length;

  // El peor caso manda: con `Math.max` un único par fresco taparía a todos los
  // rotos, y el panel diría que todo va bien.
  const oldestUpdatedAt = total ? Math.min(...pares.map((p) => p.updatedAt)) : undefined;
  // El más fresco es la prueba de que el cron sigue corriendo aunque un par
  // concreto esté roto: sin él, un par rancio no distingue «el cron está
  // caído» de «este par en particular falla».
  const newestUpdatedAt = total ? Math.max(...pares.map((p) => p.updatedAt)) : undefined;

  const status = rateFreshness(oldestUpdatedAt, nowMs);
  // Mismo corte que `rateFreshness`, aplicado par a par en vez de al peor caso.
  const rancios = pares
    .filter((p) => nowMs - p.updatedAt > RATE_OK_MS)
    .sort((a, b) => a.updatedAt - b.updatedAt);
  const alDia = total - rancios.length;
  const dias = oldestUpdatedAt === undefined ? 0 : Math.floor((nowMs - oldestUpdatedAt) / DAY_MS);

  return (
    <AdminCard
      icon={ArrowLeftRight}
      tone="var(--os-orange)"
      title="Tasas de cambio"
      badge={<StatusDot status={status} />}
      index={index}
    >
      {total === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          Todavía no hay ningún par de monedas cargado.
        </p>
      ) : (
        <div className="space-y-1.5">
          <p
            className="text-[22px] font-bold leading-none text-foreground"
            style={{ fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}
          >
            {alDia} de {total}{" "}
            <span className="text-[13px] font-semibold text-muted-foreground">
              {total === 1 ? "par al día" : "pares al día"}
            </span>
          </p>
          {oldestUpdatedAt !== undefined && (
            <p className="text-[12px] text-muted-foreground">
              El más rancio se actualizó {formatRelative(oldestUpdatedAt)}
            </p>
          )}
          {newestUpdatedAt !== undefined && (
            <p className="text-[12px] text-muted-foreground">
              El más fresco, {formatRelative(newestUpdatedAt)}
            </p>
          )}

          {/* Cuáles fallan, no solo cuántos: con el nombre del par se puede ir
              a mirar ese en concreto. Se nombran los tres peores y el resto se
              resume, para que la tarjeta no crezca con el número de monedas. */}
          {rancios.length > 0 && (
            <ul className="space-y-0.5 pt-1">
              {rancios.slice(0, MAX_PARES_NOMBRADOS).map((p) => (
                <li
                  key={`${p.fromCurrency}-${p.toCurrency}`}
                  className="truncate text-[12px] text-muted-foreground"
                >
                  <span className="font-semibold text-foreground">
                    {p.fromCurrency}→{p.toCurrency}
                  </span>{" "}
                  {formatRelative(p.updatedAt)}
                </li>
              ))}
              {rancios.length > MAX_PARES_NOMBRADOS && (
                <li className="text-[12px] text-muted-foreground">
                  y {rancios.length - MAX_PARES_NOMBRADOS} más
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      {/* La consecuencia va en el cuerpo y con el color del estado, no en la
          nota al pie: cuando algo está roto, esta frase es la línea más
          importante de la tarjeta —es lo que la hace útil— y como letra
          pequeña y gris se leería justo al revés. */}
      {status !== "ok" && (
        <p
          className="mt-3 rounded-[14px] px-3 py-2 text-[12px] font-semibold leading-snug"
          style={{ background: tint(STATUS_TONE[status], 12), color: STATUS_TEXT_TONE[status] }}
        >
          {total === 0
            ? "Nunca se han cargado tasas: mientras tanto el dashboard no puede consolidar monedas distintas."
            : `La conversión entre monedas del dashboard de todos los usuarios está usando tasas de hace ${dias} ${dias === 1 ? "día" : "días"}.`}
        </p>
      )}
    </AdminCard>
  );
}
