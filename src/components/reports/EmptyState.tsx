"use client";

import { motion, useReducedMotion } from "framer-motion";
import { FileSearch } from "lucide-react";
import { EASE_OUT_EXPO, GLASS_SURFACE } from "@/lib/ios";
import { cn } from "@/lib/utils";

/**
 * Sin movimientos en el extracto. Distingue dos situaciones que antes compartían el
 * mismo texto: el mes no tiene nada, o el filtro no deja pasar nada. La segunda
 * tiene salida —quitar el filtro— y la primera no.
 */
export function EmptyState({
  monthLabel,
  filtered,
  onClearFilter,
}: {
  monthLabel: string;
  filtered: boolean;
  onClearFilter: () => void;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
      className={cn(
        "relative overflow-hidden rounded-[28px] px-6 pb-7 pt-8 text-center",
        GLASS_SURFACE,
      )}
    >
      <div className="relative mx-auto mb-6 h-28 w-28" aria-hidden="true">
        {[0.3, 0.55, 0.8].map((v, i) => (
          <motion.svg
            key={v}
            viewBox="0 0 100 100"
            className="absolute -rotate-90"
            style={{ inset: i * 10 }}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.1 }}
          >
            <circle
              cx="50" cy="50" r="44" fill="none" strokeWidth="7"
              stroke="color-mix(in oklch, var(--os-cyan) 16%, transparent)"
            />
            <motion.circle
              cx="50" cy="50" r="44" fill="none" strokeWidth="7" strokeLinecap="round"
              stroke={["var(--os-cyan)", "var(--os-violet)", "var(--os-lime)"][i]}
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: v }}
              transition={{ duration: 1.1, delay: 0.2 + i * 0.15, ease: EASE_OUT_EXPO }}
            />
          </motion.svg>
        ))}
        <span className="absolute inset-[34px] flex items-center justify-center text-foreground">
          <FileSearch className="h-6 w-6" />
        </span>
      </div>

      <h2 className="text-lg font-extrabold tracking-tight text-foreground">
        {filtered ? "Nada con este filtro" : `Sin movimientos en ${monthLabel}`}
      </h2>
      <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground">
        {filtered
          ? `En ${monthLabel} hay movimientos, pero ninguno de este tipo.`
          : "Cuando registres movimientos en este mes, aquí podrás revisarlos y descargarlos."}
      </p>

      {filtered && (
        <button
          type="button"
          onClick={onClearFilter}
          className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-gradient-to-r from-cyan-400 to-sky-500 text-[15px] font-bold text-white shadow-[0_10px_24px_-10px_rgb(56_189_248/0.8)] transition-transform active:scale-[0.98]"
        >
          Ver todos los movimientos
        </button>
      )}
    </motion.div>
  );
}
