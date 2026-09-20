"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { EASE_OUT_EXPO, GLASS_SURFACE, haptic } from "@/lib/ios";
import { currentMonth, formatMonth, shiftMonth } from "@/lib/money";
import { cn } from "@/lib/utils";

// La aritmética vive en @/lib/money para poder usarla y probarla sin arrastrar este
// componente. Se reexporta porque varias páginas la importan desde aquí.
export { shiftMonth };

/**
 * Selector de mes en vidrio. El nombre entra deslizándose en la dirección del
 * paso, así que se siente como pasar páginas y no como un texto que se reemplaza.
 * No se puede avanzar más allá del mes en curso: no hay gasto futuro que mirar.
 */
export function MonthStepper({
  month,
  onChange,
  /** Mes más antiguo al que se puede retroceder, "YYYY-MM". Sin él no hay tope. */
  minMonth,
  /** Muestra un atajo al mes en curso cuando no se está en él. */
  showToday,
}: {
  month: string;
  onChange: (month: string) => void;
  minMonth?: string;
  showToday?: boolean;
}) {
  const reduce = useReducedMotion();
  const [dir, setDir] = useState(1);
  const today = currentMonth();
  const atCurrent = month >= today;
  const atOldest = minMonth !== undefined && month <= minMonth;

  function step(delta: number) {
    haptic();
    setDir(delta);
    onChange(shiftMonth(month, delta));
  }

  return (
    <div className={cn("flex items-center gap-1 rounded-[18px] p-1.5", GLASS_SURFACE)}>
      <Arrow label="Mes anterior" onClick={() => step(-1)} disabled={atOldest}>
        <ChevronLeft className="h-4.5 w-4.5" strokeWidth={2.5} aria-hidden="true" />
      </Arrow>

      {/* aria-live va en el contenedor estable: el <p> se remonta con cada cambio
          y una región que se remonta no se anuncia. */}
      <div className="relative flex-1 overflow-hidden text-center" aria-live="polite">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.p
            key={month}
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: dir * 26 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: dir * -26 }}
            transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
            className="truncate text-[15px] font-bold capitalize tracking-tight text-foreground"
          >
            {formatMonth(month)}
          </motion.p>
        </AnimatePresence>
      </div>

      {showToday && !atCurrent && (
        <button
          type="button"
          onClick={() => { haptic(); setDir(1); onChange(today); }}
          className="mr-0.5 shrink-0 rounded-full px-2.5 py-1 text-xs font-bold transition-transform active:scale-95"
          style={{
            background: "color-mix(in oklch, var(--os-cyan) 15%, transparent)",
            color: "var(--os-cyan-text)",
          }}
        >
          Hoy
        </button>
      )}

      <Arrow label="Mes siguiente" onClick={() => step(1)} disabled={atCurrent}>
        <ChevronRight className="h-4.5 w-4.5" strokeWidth={2.5} aria-hidden="true" />
      </Arrow>
    </div>
  );
}

function Arrow({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] text-muted-foreground transition-[background-color,color,transform] hover:bg-muted/60 hover:text-foreground active:scale-90 disabled:pointer-events-none disabled:opacity-25"
    >
      {children}
    </button>
  );
}
