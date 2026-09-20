"use client";

import { motion, useReducedMotion } from "framer-motion";
import { CreditCard, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { EASE_OUT_EXPO, GLASS_SURFACE } from "./shared";

/** Sin tarjetas. Un plástico fantasma que entra flotando en lugar de un texto suelto. */
export function EmptyState({ onCreate }: { onCreate: () => void }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
      className={cn("relative overflow-hidden rounded-[28px] px-6 pb-7 pt-8 text-center", GLASS_SURFACE)}
    >
      {/* Dos plásticos apilados en perspectiva */}
      <div className="relative mx-auto mb-7 h-28 w-44" aria-hidden="true">
        {[1, 0].map((depth) => (
          <motion.span
            key={depth}
            className="absolute inset-x-0 top-0 h-24 rounded-[16px] border border-white/30 dark:border-white/10"
            style={{
              background: depth
                ? "linear-gradient(135deg, color-mix(in oklch, var(--os-violet) 30%, transparent), color-mix(in oklch, var(--os-cyan) 20%, transparent))"
                : "linear-gradient(135deg, oklch(0.30 0.04 270), oklch(0.18 0.05 260))",
              transformOrigin: "center bottom",
            }}
            initial={reduce ? false : { opacity: 0, y: 16, rotate: depth ? -12 : 0, scale: 0.9 }}
            animate={{ opacity: 1, y: depth ? -10 : 8, rotate: depth ? -9 : 3, scale: depth ? 0.94 : 1 }}
            transition={{ duration: 0.8, delay: depth ? 0.1 : 0.25, ease: EASE_OUT_EXPO }}
          />
        ))}
        <span className="absolute inset-0 flex items-center justify-center text-white/90">
          <CreditCard className="h-7 w-7" />
        </span>
      </div>

      <h2 className="text-lg font-extrabold tracking-tight text-foreground">Sin tarjetas de crédito</h2>
      <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground">
        Registra tu tarjeta con su corte y su día de pago: verás el cupo que te queda y te avisamos antes de que venza.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-gradient-to-r from-emerald-400 to-teal-500 text-[15px] font-bold text-white shadow-[0_10px_24px_-10px_rgb(16_185_129/0.8)] transition-transform active:scale-[0.98]"
      >
        <Plus className="h-4 w-4" aria-hidden="true" /> Agregar una tarjeta
      </button>
    </motion.div>
  );
}
