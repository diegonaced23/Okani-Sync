"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { EASE_OUT_EXPO, GLASS_SURFACE, tint } from "@/lib/ios";
import { cn } from "@/lib/utils";

/**
 * Armazón de una tarjeta de ajustes.
 *
 * Las once tarjetas del perfil repetían cada una su propio marco
 * (`rounded-xl bg-card border border-border p-4`) y su propia cabecera con un icono
 * gris, así que ninguna se parecía del todo a las demás ni al resto de la aplicación.
 * Aquí el marco se declara una vez y cada ajuste queda con el color que le toca.
 */
export function SettingsCard({
  icon: Icon,
  tone,
  title,
  badge,
  description,
  footnote,
  index = 0,
  children,
}: {
  icon: LucideIcon;
  /** Color del icono; identifica el ajuste de un vistazo */
  tone: string;
  title: string;
  /** Distintivo junto al título, como el rol de administrador */
  badge?: React.ReactNode;
  /** Qué hace este ajuste, antes del control */
  description?: React.ReactNode;
  /** Advertencia o detalle, después del control */
  footnote?: React.ReactNode;
  index?: number;
  children?: React.ReactNode;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE_OUT_EXPO, delay: Math.min(index, 10) * 0.04 }}
      className={cn("rounded-[24px] p-4", GLASS_SURFACE)}
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px]"
          style={{ background: tint(tone, 16), color: tone }}
        >
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-bold text-foreground">{title}</h2>
        {badge}
      </div>

      {description && (
        <div className="mt-2.5 text-xs leading-relaxed text-muted-foreground">{description}</div>
      )}

      {children && <div className="mt-3.5">{children}</div>}

      {footnote && (
        <div className="mt-3 border-t border-border/60 pt-2.5 text-[11px] leading-relaxed text-muted-foreground">
          {footnote}
        </div>
      )}
    </motion.section>
  );
}
