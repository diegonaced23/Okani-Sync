"use client";

import { useEffect, useRef, useState } from "react";
import { EASE_OUT_EXPO } from "@/lib/ios";
import { animate, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { PACE_LABELS, type PaceStatus } from "@/lib/monthPace";

// El ease vive en @/lib/ios: aquí estaba duplicado con el mismo valor

// ─── Cifra que cuenta hasta su valor ─────────────────────────────────────────

interface AnimatedNumberProps {
  /** Valor en centavos */
  value: number;
  format: (cents: number) => string;
  className?: string;
}

/**
 * Cuenta desde el valor anterior hasta el nuevo. Con "reducir movimiento" pinta
 * el valor final directamente. El lector de pantalla solo oye el valor final.
 */
export function AnimatedNumber({ value, format, className }: AnimatedNumberProps) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (reduce) return;
    const controls = animate(from.current, value, {
      duration: 0.9,
      ease: EASE_OUT_EXPO,
      onUpdate: (v) => {
        from.current = v;
        setDisplay(Math.round(v));
      },
    });
    return () => controls.stop();
  }, [value, reduce]);

  return (
    <span className={cn("tabular-nums", className)}>
      <span aria-hidden="true">{format(reduce ? value : display)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}

// ─── Colores por estado del ritmo ────────────────────────────────────────────

export const PACE_COLOR: Record<PaceStatus, { ring: string; text: string }> = {
  vacio:          { ring: "var(--muted-foreground)", text: "var(--muted-foreground)" },
  "sin-ingresos": { ring: "var(--warning)",          text: "var(--warning-text)" },
  "en-ritmo":     { ring: "var(--os-lime)",          text: "var(--os-lime-text)" },
  rapido:         { ring: "var(--warning)",          text: "var(--warning-text)" },
  excedido:       { ring: "var(--danger)",           text: "var(--danger)" },
};

export function PacePill({ status }: { status: PaceStatus }) {
  const { text } = PACE_COLOR[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
      style={{ color: text, background: `color-mix(in oklch, ${text} 13%, transparent)` }}
    >
      <span aria-hidden className="relative flex h-1.5 w-1.5">
        {/* Pulso suave solo cuando hay algo que vigilar */}
        {(status === "rapido" || status === "excedido") && (
          <span className="absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping" style={{ background: text }} />
        )}
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: text }} />
      </span>
      {PACE_LABELS[status]}
    </span>
  );
}

// ─── Anillos concéntricos (tipo Apple Watch) ─────────────────────────────────

interface RingProps {
  radius: number;
  stroke: number;
  /** Fracción dibujada, 0–1 */
  fraction: number;
  color: string;
  delay?: number;
}

function Ring({ radius, stroke, fraction, color, delay = 0 }: RingProps) {
  const reduce = useReducedMotion();
  const clamped = Math.max(0, Math.min(1, fraction));
  return (
    <>
      <circle r={radius} cx="50%" cy="50%" fill="none" strokeWidth={stroke}
        style={{ stroke: `color-mix(in oklch, ${color} 16%, transparent)` }} />
      <motion.circle
        r={radius} cx="50%" cy="50%" fill="none" strokeWidth={stroke} strokeLinecap="round"
        style={{ stroke: color }}
        initial={reduce ? false : { pathLength: 0, opacity: 0 }}
        animate={{ pathLength: clamped, opacity: clamped > 0 ? 1 : 0 }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 55, damping: 16, delay }}
      />
    </>
  );
}

interface ActivityRingsProps {
  /** Fracción de ingresos gastada (anillo exterior) */
  spent: number;
  /** Fracción del mes transcurrida (anillo interior) */
  elapsed: number;
  spentColor: string;
  size?: number;
  label: string;
  children?: React.ReactNode;
}

export function ActivityRings({ spent, elapsed, spentColor, size = 132, label, children }: ActivityRingsProps) {
  const stroke = size * 0.1;
  const outer = size / 2 - stroke / 2;
  const inner = outer - stroke - 4;
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <Ring radius={outer} stroke={stroke} fraction={spent} color={spentColor} />
        <Ring radius={inner} stroke={stroke} fraction={elapsed} color="var(--os-cyan)" delay={0.15} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
        {children}
      </div>
    </div>
  );
}

// ─── Línea de tendencia mínima ───────────────────────────────────────────────

interface SparklineProps {
  values: number[];
  color: string;
  width?: number;
  height?: number;
}

/** Tendencia de los últimos meses; el último punto (mes en curso) se resalta. */
export function Sparkline({ values, color, width = 120, height = 36 }: SparklineProps) {
  const reduce = useReducedMotion();
  if (values.length < 2) return null;
  // Escala mínimo–máximo: con base en 0, meses parecidos se verían como una línea plana
  const min = Math.min(...values);
  const range = Math.max(...values) - min;
  const pad = 4;
  const pts = values.map((v, i) => [
    pad + (i / (values.length - 1)) * (width - pad * 2),
    range === 0 ? height / 2 : height - pad - ((v - min) / range) * (height - pad * 2),
  ] as const);
  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={width} height={height} aria-hidden="true" className="overflow-visible">
      <motion.path
        d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        initial={reduce ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: reduce ? 0 : 0.9, ease: EASE_OUT_EXPO }}
      />
      <circle cx={lx} cy={ly} r={3.5} fill={color} />
      <circle cx={lx} cy={ly} r={6} fill={color} opacity={0.2} />
    </svg>
  );
}
