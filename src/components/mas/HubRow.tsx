"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { EASE_OUT_EXPO, haptic, tint } from "@/lib/ios";
import { cn } from "@/lib/utils";

export type BadgeTone = "danger" | "warning" | "lime";

export interface HubBadge {
  count: number;
  tone: BadgeTone;
  /** Qué significa el número. Un «2» a secas no dice nada a un lector de pantalla. */
  meaning: string;
}

const BADGE_STYLE: Record<BadgeTone, { bg: string; color: string }> = {
  danger:  { bg: "var(--os-magenta)", color: "var(--os-magenta)" },
  warning: { bg: "var(--os-orange)",  color: "var(--os-orange-text)" },
  lime:    { bg: "var(--os-lime)",    color: "var(--os-lime-text)" },
};

/**
 * Fila del hub: icono teñido, nombre, una línea de qué hay dentro y, cuando algo pide
 * atención, una insignia.
 *
 * La insignia solo aparece donde el número significa «mira esto»: presupuestos
 * excedidos, deudas vencidas, invitaciones sin responder. No lleva contadores de
 * inventario —«14 categorías» no informa de nada— ni se inventan para rellenar.
 */
export function HubRow({
  href,
  icon: Icon,
  color,
  label,
  desc,
  badge,
  index,
}: {
  href: string;
  icon: LucideIcon;
  color: string;
  label: string;
  desc: string;
  badge?: HubBadge;
  index: number;
}) {
  const reduce = useReducedMotion();
  const style = badge ? BADGE_STYLE[badge.tone] : null;

  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT_EXPO, delay: Math.min(index, 10) * 0.04 }}
    >
      <Link
        href={href}
        onClick={() => haptic()}
        // El número va dentro del nombre accesible, con su significado: si no, el
        // lector de pantalla anuncia «Deudas y préstamos, 2» y el 2 queda suelto.
        aria-label={badge ? `${label}. ${badge.count} ${badge.meaning}` : undefined}
        className={cn(
          "touch-hit flex items-center gap-3.5 rounded-[18px] px-3 py-3 transition-colors",
          "active:bg-[color-mix(in_oklch,var(--muted)_55%,transparent)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px]"
          style={{ background: tint(color, 16), color }}
        >
          <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold leading-tight text-foreground">
            {label}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{desc}</span>
        </span>

        {badge && style && (
          <span
            aria-hidden="true"
            className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold tabular-nums"
            style={{ background: tint(style.bg, 18), color: style.color }}
          >
            {badge.count}
          </span>
        )}

        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />
      </Link>
    </motion.li>
  );
}
