"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BookOpen, Check, ChevronRight, FileDown, FileText, Loader2 } from "lucide-react";
import { EASE_OUT_EXPO, GLASS_SURFACE, haptic, tint } from "@/lib/ios";
import { cn } from "@/lib/utils";

type Status = "idle" | "working" | "done";

export interface ExportAction {
  key: string;
  label: string;
  hint: string;
  kind: "csv" | "pdf" | "ledger";
  disabled?: boolean;
  /** Controles propios de la acción, bajo su fila (p. ej. el rango del libro) */
  extra?: React.ReactNode;
  /** Puede ser sincrónica: el estado «generando» se ve igual porque se espera igual */
  run: () => void | Promise<void>;
}

const ICONS = { csv: FileDown, pdf: FileText, ledger: BookOpen } as const;
const COLORS = {
  csv: "var(--os-lime)",
  pdf: "var(--os-magenta)",
  ledger: "var(--os-cyan)",
} as const;

/** Cuánto se queda la marca de listo antes de volver al estado normal. */
const DONE_MS = 1600;

/**
 * Las tres exportaciones del extracto.
 *
 * Antes eran botones de contorno idénticos dentro de la caja de filtros, y solo el
 * PDF daba señal de estar trabajando. Aquí cada acción dice qué entrega y las tres
 * tienen el mismo ciclo: generando → listo.
 */
export function ExportActions({ actions }: { actions: ExportAction[] }) {
  const reduce = useReducedMotion();
  const [status, setStatus] = useState<Record<string, Status>>({});

  // Cambiar de pestaña desmonta este componente: sin esto los temporizadores de
  // «listo» seguirían corriendo y escribirían estado sobre algo que ya no existe.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  async function handle(action: ExportAction) {
    if (action.disabled || status[action.key] === "working") return;
    haptic();
    setStatus((s) => ({ ...s, [action.key]: "working" }));
    try {
      await action.run();
      setStatus((s) => ({ ...s, [action.key]: "done" }));
      // El estado «listo» se limpia solo: si no, la marca se queda pegada y el
      // siguiente mes parece exportado sin haberlo tocado.
      timers.current.push(
        setTimeout(() => setStatus((s) => ({ ...s, [action.key]: "idle" })), DONE_MS)
      );
    } catch {
      // El error lo anuncia el propio `run` con un toast; aquí solo se suelta el estado
      setStatus((s) => ({ ...s, [action.key]: "idle" }));
    }
  }

  return (
    <div className={cn("rounded-[24px] p-1.5", GLASS_SURFACE)}>
      <ul className="space-y-0.5">
        {actions.map((action, i) => {
          const Icon = ICONS[action.kind];
          const color = COLORS[action.kind];
          const state = status[action.key] ?? "idle";
          const busy = state === "working";

          return (
            <motion.li
              key={action.key}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: EASE_OUT_EXPO, delay: i * 0.05 }}
            >
              <button
                type="button"
                onClick={() => handle(action)}
                disabled={action.disabled || busy}
                aria-busy={busy}
                className={cn(
                  "touch-hit flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  action.disabled
                    ? "cursor-not-allowed opacity-45"
                    : "active:bg-[color-mix(in_oklch,var(--muted)_55%,transparent)]",
                )}
              >
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                  style={{ background: tint(color, 16), color }}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold leading-tight text-foreground">
                    {action.label}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {action.hint}
                  </span>
                </span>

                <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                  <AnimatePresence mode="wait" initial={false}>
                    {state === "working" ? (
                      <motion.span
                        key="working"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex"
                      >
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
                        <span className="sr-only">Generando…</span>
                      </motion.span>
                    ) : state === "done" ? (
                      <motion.span
                        key="done"
                        initial={reduce ? false : { opacity: 0, scale: 0.6 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                        className="flex"
                        style={{ color: "var(--os-lime-text)" }}
                      >
                        <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
                        <span className="sr-only">Listo</span>
                      </motion.span>
                    ) : (
                      <motion.span
                        key="idle"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex"
                      >
                        <ChevronRight className="h-4 w-4 text-muted-foreground/60" aria-hidden="true" />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </span>
              </button>

              {/* Los controles van fuera del botón: dentro, tocarlos dispararía la
                  exportación que se está intentando configurar. */}
              {action.extra && <div className="px-3 pb-2.5 pl-[64px]">{action.extra}</div>}
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
