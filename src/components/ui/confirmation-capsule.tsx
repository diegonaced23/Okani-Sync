"use client";

import { useEffect, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { TxConfirmation } from "@/lib/txConfirmation";
import { EASE_OUT_EXPO } from "@/lib/ios";

// Cápsula de vidrio que baja desde el borde superior con el resumen de lo que
// acaba de pasar. Vive fuera de las hojas para sobrevivir a su cierre, así que
// cualquiera la dispara con `showConfirmation` sin necesitar un contexto.

type Item = { id: number; c: TxConfirmation };

let current: Item | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function showConfirmation(c: TxConfirmation) {
  current = { id: ++seq, c };
  emit();
}

function dismiss(id: number) {
  if (current?.id !== id) return;
  current = null;
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** Lo justo para leer dos líneas cortas sin que estorbe al siguiente registro */
const VISIBLE_MS = 2400;

/** Resorte con un rebote leve, como la cápsula que se desprende del borde */
const DROP_SPRING = { type: "spring", stiffness: 420, damping: 26, mass: 0.9 } as const;

/**
 * No intenta saber si el teléfono tiene isla, notch o cámara perforada: nace en
 * el borde superior y se asienta bajo `safe-area-inset-top`. En un iPhone con
 * isla parece brotar de ella porque la isla ocupa justo ese sitio.
 */
export function ConfirmationCapsule() {
  const item = useSyncExternalStore(subscribe, () => current, () => null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!item) return;
    const t = setTimeout(() => dismiss(item.id), VISIBLE_MS);
    return () => clearTimeout(t);
  }, [item]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top,0px)+0.5rem)] z-[100] flex justify-center px-4"
    >
      <AnimatePresence>
        {item && (
          <motion.div
            key={item.id}
            // Tocarla o deslizarla hacia arriba la despide antes de tiempo
            onClick={() => dismiss(item.id)}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.6, bottom: 0.08 }}
            onDragEnd={(_, info) => {
              if (info.offset.y < -16 || info.velocity.y < -300) dismiss(item.id);
            }}
            // Se desprende del borde estirada como una gota y se ensancha al asentarse
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -28, scaleX: 0.4, scaleY: 0.6 }}
            animate={{ opacity: 1, y: 0, scaleX: 1, scaleY: 1 }}
            exit={
              reduce
                ? { opacity: 0 }
                : { opacity: 0, y: -24, scaleX: 0.45, scaleY: 0.6, transition: { duration: 0.28, ease: EASE_OUT_EXPO } }
            }
            transition={reduce ? { duration: 0.15 } : DROP_SPRING}
            className="os-liquid-glass pointer-events-auto relative flex h-[60px] w-full max-w-[22rem] cursor-default touch-none select-none items-center gap-3 rounded-full pl-2.5 pr-5"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-[0_6px_14px_-6px_rgb(16_185_129/0.9)]">
              <svg viewBox="0 0 24 24" className="size-[22px]" fill="none" aria-hidden="true">
                <motion.path
                  d="M20 6 9 17l-5-5"
                  stroke="currentColor"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: reduce ? 1 : 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.3, delay: 0.18, ease: EASE_OUT_EXPO }}
                />
              </svg>
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[15px] font-bold tabular-nums text-foreground">{item.c.title}</span>
              <span className="block truncate text-[13px] text-muted-foreground">{item.c.detail}</span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
