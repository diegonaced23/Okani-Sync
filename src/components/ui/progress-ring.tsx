"use client";

import { motion, useReducedMotion } from "framer-motion";
import { tint } from "@/lib/ios";
import { cn } from "@/lib/utils";

/**
 * Anillo de progreso al estilo de los anillos de Actividad de iOS: pista tenue del
 * mismo color y arco redondeado que se llena animado. `children` va al centro.
 * Opcionalmente muestra un segundo arco fantasma (`preview`) para anticipar un valor
 * futuro, p. ej. cómo quedaría la deuda tras un abono.
 */
export function ProgressRing({
  value,
  preview,
  color,
  size = 44,
  stroke = 5,
  children,
  className,
  label,
}: {
  /** 0–1 */
  value: number;
  /** 0–1, mayor que `value` */
  preview?: number;
  color: string;
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
  className?: string;
  /** Texto para lectores de pantalla; sin él el anillo es decorativo */
  label?: string;
}) {
  const reduce = useReducedMotion();
  const r = (size - stroke) / 2;
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  const v = clamp(value);
  const p = preview !== undefined ? clamp(preview) : undefined;

  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tint(color, 18)} strokeWidth={stroke} />
        {p !== undefined && p > v && (
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={tint(color, 45)}
            strokeWidth={stroke}
            strokeLinecap="round"
            initial={false}
            animate={{ pathLength: p }}
            transition={{ duration: reduce ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] }}
          />
        )}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: v, opacity: v > 0 ? 1 : 0 }}
          transition={{ duration: reduce ? 0 : 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
        />
      </svg>
      <span className="relative flex items-center justify-center">{children}</span>
    </span>
  );
}
