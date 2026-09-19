"use client";

import { useEffect, useRef } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { SPRING, haptic } from "@/lib/ios";
import { cn } from "@/lib/utils";

export interface SwipeAction {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Fondo del botón (clase de Tailwind) */
  className: string;
  onAction: () => void;
}

/** Ancho de cada acción revelada */
const ACTION_W = 76;
/** Deslizar más allá de esta fracción del ancho ejecuta la última acción (como Mail en iOS) */
const FULL_SWIPE = 0.55;

/**
 * Fila que al deslizar a la izquierda revela acciones detrás. Soltar a medio camino
 * la deja abierta; deslizar hasta el fondo ejecuta la última acción. Solo una fila
 * abierta a la vez: el padre guarda cuál (`openId`).
 *
 * El contenido tocable va en `children` (un botón). Su clic se cancela si hubo
 * arrastre, y con la fila abierta un toque solo la cierra.
 */
export function SwipeRow({
  id,
  actions,
  openId,
  setOpenId,
  disabled,
  children,
  className,
}: {
  id: string;
  actions: SwipeAction[];
  openId: string | null;
  setOpenId: (id: string | null) => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const rowRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const dragged = useRef(false);
  const pastFull = useRef(false);
  const committing = useRef(false);

  const openW = ACTION_W * actions.length;
  const revealed = useTransform(x, (v) => Math.max(0, -v));
  const actionsOpacity = useTransform(x, [-24, 0], [1, 0]);
  const isOpen = openId === id;

  useEffect(() => {
    if (!isOpen && x.get() !== 0 && !committing.current) {
      animate(x, 0, reduce ? { duration: 0 } : SPRING);
    }
  }, [isOpen, x, reduce]);

  function width() {
    return rowRef.current?.offsetWidth ?? 360;
  }

  function close() {
    animate(x, 0, SPRING);
    setOpenId(null);
  }

  function run(action: SwipeAction, slideOut: boolean) {
    if (!slideOut) {
      close();
      action.onAction();
      return;
    }
    committing.current = true;
    animate(x, -width(), { duration: 0.2, ease: "easeIn" }).then(() => {
      setOpenId(null);
      action.onAction();
      // Si la fila sigue montada (la acción no la quitó o falló), vuelve a su sitio
      animate(x, 0, { delay: 0.5, ...SPRING }).then(() => { committing.current = false; });
    });
  }

  function handleDrag(_: unknown, info: PanInfo) {
    const past = -info.offset.x > width() * FULL_SWIPE;
    if (past !== pastFull.current) {
      pastFull.current = past;
      haptic(past ? 15 : 6);
    }
  }

  function handleDragEnd(_: unknown, info: PanInfo) {
    pastFull.current = false;
    const current = -x.get();
    if (current > width() * FULL_SWIPE && actions.length > 0) {
      run(actions[actions.length - 1], true);
      return;
    }
    const open = current > openW / 2 || info.velocity.x < -400;
    animate(x, open ? -openW : 0, SPRING);
    setOpenId(open ? id : null);
  }

  return (
    <div ref={rowRef} className={cn("relative overflow-hidden rounded-[16px]", className)}>
      {!disabled && actions.length > 0 && (
        <motion.div
          className="absolute inset-y-0 right-0 flex overflow-hidden rounded-[16px]"
          style={{ width: revealed, opacity: actionsOpacity }}
          aria-hidden={!isOpen}
        >
          {actions.map((a, i) => {
            const Icon = a.icon;
            const last = i === actions.length - 1;
            return (
              <button
                key={a.key}
                type="button"
                tabIndex={isOpen ? 0 : -1}
                onClick={() => run(a, false)}
                className={cn(
                  "flex min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-bold text-white",
                  // La última crece al deslizar de más: es la que se ejecuta al soltar
                  last ? "flex-[1_1_76px]" : "flex-[0_1_76px]",
                  a.className,
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{a.label}</span>
              </button>
            );
          })}
        </motion.div>
      )}

      <motion.div
        drag={disabled ? false : "x"}
        dragDirectionLock
        dragConstraints={{ right: 0 }}
        dragElastic={{ left: 0.08, right: 0.02 }}
        dragMomentum={false}
        onPointerDownCapture={() => { dragged.current = false; }}
        onClickCapture={(e) => {
          if (dragged.current || isOpen) {
            e.stopPropagation();
            e.preventDefault();
            if (isOpen && !dragged.current) close();
          }
        }}
        onDragStart={() => { dragged.current = true; if (!isOpen) setOpenId(id); }}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        style={{ x }}
        className="relative"
      >
        {children}
      </motion.div>
    </div>
  );
}
