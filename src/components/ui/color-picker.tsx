"use client";

import { useId } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { ACCOUNT_COLORS } from "@/lib/constants";
import { OVERFLOW_ROW, SPRING, haptic, tint } from "@/lib/ios";
import { cn } from "@/lib/utils";

/**
 * Muestras de color con un anillo que se desliza hasta la elegida. Con dedo es una
 * fila deslizable; con mouse pasa a varias líneas (OVERFLOW_ROW).
 */
export function ColorPicker({
  value,
  onChange,
  original,
}: {
  value: string;
  onChange: (c: string) => void;
  /** Color con el que se abrió el formulario. Las categorías por defecto usan colores
   *  fuera de la paleta: se muestra primero para poder volver a él. */
  original?: string;
}) {
  const id = useId();
  const inPalette = (c: string) => ACCOUNT_COLORS.some((p) => p.toLowerCase() === c.toLowerCase());
  const colors = original && !inPalette(original) ? [original, ...ACCOUNT_COLORS] : [...ACCOUNT_COLORS];

  return (
    <div
      role="radiogroup"
      aria-label="Color"
      className={cn(OVERFLOW_ROW, "gap-2.5 py-1.5")}
    >
      {colors.map((c) => {
        const selected = c.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`Color ${c}`}
            onClick={() => { haptic(); onChange(c); }}
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-transform active:scale-90"
          >
            {selected && (
              <motion.span
                layoutId={`${id}-ring`}
                className="absolute -inset-[3px] rounded-full border-2"
                style={{ borderColor: c }}
                transition={SPRING}
              />
            )}
            <span
              className="h-8 w-8 rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
              style={{ background: `radial-gradient(circle at 30% 28%, ${tint(c, 70)}, ${c} 70%)` }}
            />
            <AnimatePresence>
              {selected && (
                <motion.span
                  className="absolute"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 700, damping: 26 }}
                >
                  <Check className="h-4 w-4 text-white drop-shadow" strokeWidth={3} aria-hidden="true" />
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        );
      })}
    </div>
  );
}
