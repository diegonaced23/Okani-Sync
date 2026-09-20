"use client";

import { useId } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CalendarClock, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useBalanceHidden } from "@/hooks/use-balance-hidden";
import { EASE_OUT_EXPO, GLASS_SURFACE, tint } from "@/lib/ios";
import { formatCents, formatMonth } from "@/lib/money";
import { cn } from "@/lib/utils";

const MASK = "$ ••••••";

export interface NetWorthPoint {
  month: string;
  netWorth: number;
  totalAssets: number;
  totalCardDebt: number;
  totalDebt: number;
  totalLoansReceivable: number;
  currency: string;
  /** Calculado ahora mismo, no guardado por el cron */
  live?: boolean;
}

interface NetWorthHistoryCardProps {
  points: NetWorthPoint[] | undefined;
  currency: string;
  /** Monedas de snapshots antiguos que no coinciden con la preferida de hoy */
  otherCurrencies: string[];
  /** Monedas sin tasa en el punto en vivo */
  missingRates: string[];
  /** Mes en curso, para explicar cuándo se guarda el primer punto */
  liveMonth: string;
}

const W = 600;
const H = 160;
const PAD_X = 6;
const PAD_Y = 14;

/** Etiqueta corta del mes: «sep 26». */
function shortMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-CO", { month: "short", year: "2-digit" });
}

/**
 * Histórico de patrimonio neto.
 *
 * El cron guarda un punto el día 1 de cada mes y hasta ahora nadie los leía. El
 * último punto es el de hoy, calculado en vivo: se dibuja hueco y unido con línea
 * discontinua porque todavía no está guardado y puede moverse hasta fin de mes.
 */
export function NetWorthHistoryCard({
  points,
  currency,
  otherCurrencies,
  missingRates,
  liveMonth,
}: NetWorthHistoryCardProps) {
  const reduce = useReducedMotion();
  const [hidden] = useBalanceHidden();
  const gradientId = useId();

  if (points === undefined) return <NetWorthHistoryCardSkeleton />;

  const money = (cents: number, cur = currency) => (hidden ? MASK : formatCents(cents, cur));

  // Con un solo punto no hay historia que dibujar, pero sí algo que decir: cuándo
  // llega el siguiente. Antes de este cambio el usuario no sabía ni que existía.
  if (points.length < 2) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 items-center justify-center rounded-full"
            style={{ background: tint("var(--os-violet)", 16), color: "var(--os-violet-text)" }}
          >
            <CalendarClock className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold text-foreground">
              {points.length === 0
                ? "Todavía no hay histórico"
                : `Un solo punto: ${formatMonth(liveMonth)}`}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              El patrimonio se archiva el día 1 de cada mes y no se puede reconstruir hacia
              atrás. A partir del próximo día 1 tendrás un punto más y la línea empezará a
              contar tu historia.
            </p>
          </div>
        </div>
      </Shell>
    );
  }

  const values = points.map((p) => p.netWorth);
  // La escala incluye el cero cuando queda dentro del rango: un patrimonio que cruza
  // a negativo tiene que verse cruzar, no reescalarse como si nada hubiera pasado.
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const min = Math.min(rawMin, rawMax > 0 ? 0 : rawMax);
  const max = Math.max(rawMax, rawMin < 0 ? 0 : rawMin);
  const span = max - min || 1;

  const coords = points.map((p, i) => {
    const x = PAD_X + (i / (points.length - 1)) * (W - PAD_X * 2);
    const y = H - PAD_Y - ((p.netWorth - min) / span) * (H - PAD_Y * 2);
    return { x, y };
  });

  // Dos trazos: el de los puntos archivados y el tramo hasta el punto en vivo, que
  // va discontinuo. Con un solo punto archivado el trazo sólido sale vacío («M» sin
  // «L» no dibuja nada) y el discontinuo cubre los dos, que es lo correcto.
  const liveIndex = points.findIndex((p) => p.live);
  const hasLive = liveIndex > 0;
  const savedCoords = hasLive ? coords.slice(0, liveIndex) : coords;
  const line = (pts: { x: number; y: number }[]) =>
    pts.map(({ x, y }, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

  const last = points[points.length - 1];
  const first = points[0];
  const delta = last.netWorth - first.netWorth;
  const up = delta >= 0;
  // Restar dos puntos archivados en monedas distintas no da una variación: da un
  // número sin unidad. Cuando eso pasa no se muestra, y el aviso de abajo explica
  // por qué la línea mezcla unidades.
  const comparable = points.every((p) => p.currency === last.currency);
  const zeroY = H - PAD_Y - ((0 - min) / span) * (H - PAD_Y * 2);
  const showZero = rawMin < 0 && rawMax > 0;

  const area = `${line(coords)} L${coords[coords.length - 1].x.toFixed(1)},${H} L${coords[0].x.toFixed(1)},${H} Z`;

  return (
    <Shell>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {last.live ? "Hoy" : formatMonth(last.month)}
          </p>
          <p className="font-mono-num text-[26px] font-extrabold leading-tight tabular-nums text-foreground">
            {money(last.netWorth)}
          </p>
        </div>
        {comparable && (
          <span
            className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold tabular-nums"
            style={{
              background: tint(up ? "var(--os-lime)" : "var(--os-magenta)", 16),
              color: up ? "var(--os-lime-text)" : "var(--os-magenta)",
            }}
          >
            {up ? <TrendingUp className="h-3 w-3" aria-hidden="true" /> : <TrendingDown className="h-3 w-3" aria-hidden="true" />}
            {hidden ? MASK : `${up ? "+" : "−"}${formatCents(Math.abs(delta), last.currency)}`}
            <span className="font-semibold opacity-70">desde {shortMonth(first.month)}</span>
          </span>
        )}
      </div>

      {/* Gráfico. Es una imagen: el detalle accesible va en la tabla de abajo. */}
      <div className="mt-4">
        {/* Sin `preserveAspectRatio="none"`: estirar el viewBox en horizontal dejaba
            los puntos ovalados. El trazo no se encoge con la escala gracias a
            `non-scaling-stroke`. */}
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full overflow-visible"
          role="img"
          aria-label={`Patrimonio neto de ${formatMonth(first.month)} a ${last.live ? "hoy" : formatMonth(last.month)}`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--os-violet)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--os-violet)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {showZero && (
            <line
              x1={PAD_X} y1={zeroY} x2={W - PAD_X} y2={zeroY}
              stroke="var(--border)" strokeWidth={1} strokeDasharray="3 4"
            />
          )}

          <motion.path
            d={area}
            fill={`url(#${gradientId})`}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3, ease: EASE_OUT_EXPO }}
          />

          <motion.path
            d={line(savedCoords)}
            fill="none"
            stroke="var(--os-violet)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: reduce ? 0 : 1, ease: EASE_OUT_EXPO }}
          />

          {/* El tramo hasta hoy va discontinuo: ese punto aún no está archivado */}
          {liveIndex > 0 && (
            <motion.path
              d={line(coords.slice(liveIndex - 1))}
              fill="none"
              stroke="var(--os-violet)"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeDasharray="5 5"
              vectorEffect="non-scaling-stroke"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 0.75 }}
              transition={{ duration: 0.4, delay: 0.8 }}
            />
          )}

          {coords.map(({ x, y }, i) => (
            <motion.circle
              key={points[i].month}
              cx={x}
              cy={y}
              r={points[i].live ? 5 : 3.5}
              fill={points[i].live ? "var(--card)" : "var(--os-violet)"}
              stroke="var(--os-violet)"
              strokeWidth={points[i].live ? 2.5 : 0}
              vectorEffect="non-scaling-stroke"
              initial={reduce ? false : { opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.6 + i * 0.04, ease: EASE_OUT_EXPO }}
            />
          ))}
        </svg>

        <div className="mt-1 flex justify-between px-1 text-[10px] font-semibold text-muted-foreground">
          <span>{shortMonth(first.month)}</span>
          <span>{last.live ? "hoy" : shortMonth(last.month)}</span>
        </div>
      </div>

      {/* Composición del último punto: los cuatro números ya venían guardados y no
          se mostraban en ninguna parte. */}
      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border/60 pt-3 sm:grid-cols-4">
        {[
          { label: "Cuentas", value: last.totalAssets, color: "var(--os-lime)" },
          { label: "Por cobrar", value: last.totalLoansReceivable, color: "var(--os-cyan)" },
          { label: "Tarjetas", value: -last.totalCardDebt, color: "var(--os-magenta)" },
          { label: "Deudas", value: -last.totalDebt, color: "var(--os-orange)" },
        ].map((item) => (
          <li key={item.label}>
            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: item.color }}
              />
              {item.label}
            </p>
            <p className="font-mono-num text-[13px] font-bold tabular-nums text-foreground">
              {hidden
                ? MASK
                : `${item.value < 0 ? "−" : ""}${formatCents(Math.abs(item.value), last.currency)}`}
            </p>
          </li>
        ))}
      </ul>

      {/* Alternativa accesible al gráfico */}
      <table className="sr-only">
        <caption>Patrimonio neto por mes</caption>
        <thead>
          <tr>
            <th scope="col">Mes</th>
            <th scope="col">Patrimonio neto</th>
            <th scope="col">Origen</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.month}>
              <td>{formatMonth(p.month)}</td>
              <td>{money(p.netWorth, p.currency)}</td>
              <td>{p.live ? "Calculado ahora" : "Archivado el día 1"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {otherCurrencies.length > 0 && (
        <p className="mt-3 text-[11px] text-muted-foreground/80">
          Hay puntos archivados en {otherCurrencies.join(", ")}, la moneda que tenías
          entonces. No se convierten: la línea mezcla unidades en esos meses.
        </p>
      )}

      {missingRates.length > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground/80">
          Sin tasa de cambio para {missingRates.join(", ")}: esos saldos quedan fuera del
          punto de hoy.
        </p>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
      className={cn("relative overflow-hidden rounded-[28px] p-5", GLASS_SURFACE)}
      aria-label="Histórico de patrimonio neto"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-[var(--os-violet)] opacity-[0.12] blur-3xl"
      />
      <div className="relative mb-4 flex items-center gap-2">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 items-center justify-center rounded-full"
          style={{ background: tint("var(--os-violet)", 16), color: "var(--os-violet-text)" }}
        >
          <Wallet className="h-4 w-4" />
        </span>
        <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          Patrimonio neto
        </h2>
      </div>
      <div className="relative">{children}</div>
    </motion.section>
  );
}

/**
 * Altura aproximada del caso con gráfico. El SVG conserva su proporción (600×160), así
 * que su altura depende del ancho del contenedor y este número no puede ser exacto:
 * se toma el caso de móvil, donde el gráfico mide algo menos de 100 px.
 */
export function NetWorthHistoryCardSkeleton() {
  return <Skeleton className="h-[320px] rounded-[28px]" />;
}
