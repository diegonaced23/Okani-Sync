"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { EASE_OUT_EXPO, GLASS_SURFACE, tint } from "@/lib/ios";
import { cn } from "@/lib/utils";

/**
 * Marco de una tarjeta del panel de administración.
 *
 * Es gemela de `src/components/perfil/SettingsCard.tsx` y NO la reutiliza a
 * propósito: aquella vive en el módulo de perfil, tiene once consumidores
 * propios y un `description` que aquí no hace falta, porque en el panel el
 * contenido ES el dato. Generalizar una sola para los dos módulos haría que
 * cualquier ajuste del panel alterase la pantalla de perfil.
 */
export function AdminCard({
  icon: Icon,
  tone,
  title,
  badge,
  footnote,
  index = 0,
  children,
}: {
  icon: LucideIcon;
  /** Color del chip del icono; identifica la tarjeta de un vistazo */
  tone: string;
  title: string;
  /** Estado o cifra destacada, a la derecha del título */
  badge?: React.ReactNode;
  /** Matiz o advertencia, debajo del contenido */
  footnote?: React.ReactNode;
  index?: number;
  children?: React.ReactNode;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        ease: EASE_OUT_EXPO,
        delay: Math.min(index, 10) * 0.04,
      }}
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
        {/* h3 y no h2: el título de la tarjeta cuelga del encabezado de sección
            de la página («Estado del sistema», «Personas»), que ya es un h2.
            Con h2 aquí, cada tarjeta quedaría como hermana de su sección y el
            esquema del documento se leería plano. */}
        <h3 className="min-w-0 flex-1 truncate text-[15px] font-bold text-foreground">
          {title}
        </h3>
        {badge}
      </div>

      <div className="mt-3">{children}</div>

      {footnote && (
        <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
          {footnote}
        </p>
      )}
    </motion.section>
  );
}
