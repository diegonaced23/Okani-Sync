"use client";

import { memo } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface MoMDeltaProps {
  /** Valor acumulado del mes en curso, en centavos */
  current: number;
  /**
   * Valor del mes anterior **prorrateado a los días transcurridos**, en centavos.
   * Comparar el acumulado parcial del mes en curso contra un mes previo completo
   * daría una caída falsa todos los días salvo el último. undefined = sin mes previo.
   */
  previous: number | undefined;
  /**
   * Qué significa subir. "up-good" para ingresos y ahorro, "up-bad" para gastos.
   * Determina el color, no el icono: la flecha siempre apunta al sentido real.
   */
  polarity: "up-good" | "up-bad";
  /** Etiqueta para lectores de pantalla, ej. "ingresos" */
  srLabel: string;
}

/** Umbral por debajo del cual la variación se considera plana (±2%). */
const FLAT_THRESHOLD = 2;

/**
 * Chip de variación respecto al mes anterior.
 *
 * Devuelve null cuando no hay base de comparación: sin mes previo, o con mes
 * previo en cero (dividir por cero daría un "∞%" que no informa nada).
 */
export const MoMDelta = memo(function MoMDelta({
  current,
  previous,
  polarity,
  srLabel,
}: MoMDeltaProps) {
  // Sin base de comparación no hay chip: un mes previo en cero daría "∞%", y un
  // acumulado en cero daría siempre "−100%", que es ruido y no información.
  if (previous === undefined || previous <= 0 || current === 0) return null;

  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.round(pct);
  const isFlat = Math.abs(pct) < FLAT_THRESHOLD;
  const isUp = pct > 0;

  // Flat → neutro. Si no, el color depende de si subir es bueno en esta métrica.
  const good = isUp === (polarity === "up-good");
  const color = isFlat
    ? "var(--muted-foreground)"
    : good
      ? "var(--os-lime-text)"
      : "var(--destructive)";

  const Icon = isFlat ? Minus : isUp ? TrendingUp : TrendingDown;
  const sign = isFlat ? "" : isUp ? "+" : "";
  const text = isFlat ? "igual" : `${sign}${rounded}%`;

  const description = isFlat
    ? `${srLabel} sin cambios respecto al mismo punto del mes anterior`
    : `${srLabel} ${isUp ? "suben" : "bajan"} ${Math.abs(rounded)}% respecto al mismo punto del mes anterior`;

  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums shrink-0"
      style={{
        color,
        background: `color-mix(in oklch, ${color} 12%, transparent)`,
      }}
      // title para que quien ve el chip sepa que la base está prorrateada
      title={description}
    >
      <Icon size={10} strokeWidth={2.5} aria-hidden="true" />
      <span aria-hidden="true">{text}</span>
      <span className="sr-only">{description}</span>
    </span>
  );
});
