"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type TargetAndTransition, type Transition } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import type { TxConfirmation } from "@/lib/txConfirmation";
import { showConfirmation } from "@/components/ui/confirmation-capsule";
import { cn } from "@/lib/utils";
import { EASE_OUT_EXPO, SPRING, haptic } from "./shared";

/**
 * Cuánto dura la gota en el botón antes de seguir (cerrar la hoja o volver al
 * detalle). Es la confirmación inmediata; el resumen lo lleva la cápsula
 * superior, que sobrevive al cierre de la hoja.
 */
const DROP_MS = 650;

export type SavePhase = "idle" | "drop" | "leaving";

/**
 * Confirmación de un movimiento guardado, en lugar de un toast. Primero el botón
 * se vuelve una gota con el check; luego la gota se disuelve, la cápsula baja
 * con el resumen y se llama a `onDone`.
 *
 * Si el formulario se desmonta antes (la hoja se cerró a mano), el resumen se
 * muestra igual: el movimiento ya se guardó. Lo que se cancela es `onDone`, para
 * no cerrar una hoja que se haya vuelto a abrir entretanto.
 */
export function useSaveConfirmation(onDone?: () => void) {
  const [phase, setPhase] = useState<SavePhase>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<TxConfirmation | null>(null);
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; });
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (pending.current) showConfirmation(pending.current);
  }, []);

  const confirm = useCallback((c: TxConfirmation) => {
    pending.current = c;
    setPhase("drop");
    haptic(12);
    timer.current = setTimeout(() => {
      pending.current = null;
      setPhase("leaving");
      showConfirmation(c);
      onDoneRef.current?.();
    }, DROP_MS);
  }, []);

  return { phase, confirm };
}

interface SaveMovementButtonProps {
  loading: boolean;
  phase: SavePhase;
  label: string;
  /** "submit" dentro de un <form>; "button" con `onClick` si el formulario no lo es */
  type?: "submit" | "button";
  onClick?: () => void;
  /** Acción secundaria a la derecha (p. ej. Cancelar); se retira al confirmar */
  secondary?: React.ReactNode;
  /**
   * id del <form> que envía. Hace falta cuando el botón vive en el pie fijo de la
   * hoja (AppSheetFooter), que se pinta fuera del formulario.
   */
  form?: string;
  /** Margen del contenedor; en el pie fijo sobra el de por defecto */
  className?: string;
}

const SIZE = 48;

/**
 * Botón de guardar que, al confirmarse el movimiento, se contrae hasta una gota
 * de vidrio con el check, se asienta con un rebote (tensión superficial) y se
 * disuelve como una burbuja mientras la hoja se va.
 */
export function SaveMovementButton({
  loading, phase, label, type = "submit", onClick, secondary, form, className = "mt-2",
}: SaveMovementButtonProps) {
  const reduce = useReducedMotion();
  const done = phase !== "idle";

  let animate: TargetAndTransition;
  let transition: Transition;
  if (phase === "idle") {
    animate = { width: "100%", borderRadius: 16, y: 0, scaleX: 1, scaleY: 1, opacity: 1, filter: "blur(0px)" };
    transition = { duration: 0 };
  } else if (phase === "drop") {
    animate = reduce
      ? { width: SIZE, borderRadius: SIZE / 2 }
      : {
          width: SIZE,
          borderRadius: SIZE / 2,
          // Se levanta estirada y rebota al asentarse, como una gota que se forma
          y: [0, -14, -8, -10],
          scaleX: [1, 0.9, 1.06, 1],
          scaleY: [1, 1.12, 0.95, 1],
        };
    transition = reduce
      ? { duration: 0 }
      : {
          width: SPRING,
          borderRadius: SPRING,
          default: { duration: 0.56, delay: 0.14, times: [0, 0.35, 0.65, 1], ease: "easeOut" },
        };
  } else {
    animate = reduce
      ? { width: SIZE, borderRadius: SIZE / 2, opacity: 0 }
      : { width: SIZE, borderRadius: SIZE / 2, y: -10, scaleX: 1.4, scaleY: 1.4, opacity: 0, filter: "blur(6px)" };
    transition = { duration: reduce ? 0.15 : 0.3, ease: "easeOut" };
  }

  return (
    <div className={cn("flex h-12 items-center gap-2", className)}>
      <div className="flex min-w-0 flex-1 justify-center">
        <motion.button
          type={type}
          form={form}
          onClick={onClick}
          disabled={loading || done}
          aria-label={done ? "Movimiento guardado" : undefined}
          data-done={done || undefined}
          initial={false}
          animate={animate}
          transition={transition}
          className="flex h-12 shrink-0 items-center justify-center gap-2 overflow-hidden bg-gradient-to-r from-emerald-400 to-teal-500 text-[15px] font-bold text-white shadow-[0_10px_24px_-10px_rgb(16_185_129/0.8)] transition-[scale] active:scale-[0.98] disabled:cursor-default [&:disabled:not([data-done])]:opacity-50 data-[done]:shadow-[inset_0_1.5px_0_rgb(255_255_255/0.6),inset_0_-6px_12px_-6px_rgb(4_120_87/0.5),0_12px_24px_-10px_rgb(16_185_129/0.8)]"
        >
          {done ? (
            <svg viewBox="0 0 24 24" className="size-6 shrink-0" fill="none" aria-hidden="true">
              <motion.path
                d="M20 6 9 17l-5-5"
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: reduce ? 1 : 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.28, delay: 0.16, ease: EASE_OUT_EXPO }}
              />
            </svg>
          ) : (
            <>
              {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Check className="h-4 w-4 shrink-0" strokeWidth={2.5} />}
              <span className="whitespace-nowrap">{loading ? "Guardando…" : label}</span>
            </>
          )}
        </motion.button>
      </div>

      <AnimatePresence initial={false}>
        {!done && secondary && (
          <motion.div
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.12 }}
            className="shrink-0"
          >
            {secondary}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
