"use client";

import { useRef } from "react";
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";

const MAX_TILT = 9; // grados

/**
 * Envuelve un plástico y le da profundidad: inclinación que sigue al puntero y un
 * reflejo de luz que se desplaza por la superficie (como los pósteres de Apple TV).
 * Solo reacciona a mouse/lápiz; en táctil queda quieto con su sombra en capas.
 * Con "reducir movimiento" no se inclina.
 */
export function CardTilt({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  // Posición del puntero normalizada 0–1 (0.5 = centro)
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const spring = { stiffness: 180, damping: 18 };
  const rotateX = useSpring(useTransform(py, [0, 1], [MAX_TILT, -MAX_TILT]), spring);
  const rotateY = useSpring(useTransform(px, [0, 1], [-MAX_TILT, MAX_TILT]), spring);
  const glareX = useTransform(px, (v) => `${v * 100}%`);
  const glareY = useTransform(py, (v) => `${v * 100}%`);
  const glare = useMotionTemplate`radial-gradient(circle at ${glareX} ${glareY}, oklch(1 0 0 / 0.35), transparent 55%)`;
  const glareOpacity = useSpring(0, spring);

  function onMove(e: React.PointerEvent) {
    if (reduce || e.pointerType === "touch" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
    glareOpacity.set(1);
  }

  function onLeave() {
    px.set(0.5);
    py.set(0.5);
    glareOpacity.set(0);
  }

  return (
    <div className={cn("[perspective:900px]", className)}>
      <motion.div
        ref={ref}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        style={reduce ? undefined : { rotateX, rotateY, transformStyle: "preserve-3d" }}
        className={cn(
          "relative h-full overflow-hidden rounded-[20px]",
          // Sombra en capas: contacto cercano + sombra ambiental lejana
          "shadow-[0_1px_2px_oklch(0_0_0/0.12),0_6px_12px_-6px_oklch(0_0_0/0.22),0_16px_24px_-14px_oklch(0_0_0/0.3)]"
        )}
      >
        {children}
        {/* Brillo fijo del borde superior, como el canto de un plástico */}
        <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[20px] shadow-[inset_0_1px_0_oklch(1_0_0/0.35)]" />
        {!reduce && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 mix-blend-soft-light"
            style={{ background: glare, opacity: glareOpacity }}
          />
        )}
      </motion.div>
    </div>
  );
}
