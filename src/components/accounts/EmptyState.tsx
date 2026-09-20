"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Landmark, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { EASE_OUT_EXPO, GLASS_SURFACE } from "./shared";

/** Sin cuentas. Los anillos anticipan el lenguaje visual del listado. */
export function EmptyState({ onCreate }: { onCreate: () => void }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
      className={cn("relative overflow-hidden rounded-[28px] px-6 pb-7 pt-8 text-center", GLASS_SURFACE)}
    >
      <div className="relative mx-auto mb-6 h-32 w-32" aria-hidden="true">
        {[0.4, 0.68, 0.9].map((v, i) => (
          <motion.svg
            key={v}
            viewBox="0 0 100 100"
            className="absolute -rotate-90"
            style={{ inset: i * 11 }}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.1 }}
          >
            <circle cx="50" cy="50" r="44" fill="none" strokeWidth="8" stroke="color-mix(in oklch, var(--os-cyan) 16%, transparent)" />
            <motion.circle
              cx="50" cy="50" r="44" fill="none" strokeWidth="8" strokeLinecap="round"
              stroke={["var(--os-violet)", "var(--os-lime)", "var(--os-cyan)"][i]}
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: v }}
              transition={{ duration: 1.1, delay: 0.2 + i * 0.15, ease: EASE_OUT_EXPO }}
            />
          </motion.svg>
        ))}
        <span className="absolute inset-[38px] flex items-center justify-center text-foreground">
          <Landmark className="h-7 w-7" />
        </span>
      </div>

      <h2 className="text-lg font-extrabold tracking-tight text-foreground">Sin cuentas registradas</h2>
      <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground">
        Registra dónde tienes tu dinero —el banco, el ahorro, el efectivo— y cada movimiento sabrá de dónde sale.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-gradient-to-r from-emerald-400 to-teal-500 text-[15px] font-bold text-white shadow-[0_10px_24px_-10px_rgb(16_185_129/0.8)] transition-transform active:scale-[0.98]"
      >
        <Plus className="h-4 w-4" aria-hidden="true" /> Agregar mi primera cuenta
      </button>
    </motion.div>
  );
}
