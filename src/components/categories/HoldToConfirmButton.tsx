"use client";

import { useRef, useState } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";
import { haptic } from "./shared";

/**
 * Botón destructivo de "mantener presionado": un relleno avanza mientras el dedo
 * sigue apoyado y la acción se dispara al completarse. Soltar antes lo revierte.
 *
 * Teclado y lectores de pantalla no pueden "mantener" un clic: para ellos el
 * primer clic arma el botón y el segundo confirma.
 */
export function HoldToConfirmButton({
  label,
  armedLabel = "Toca de nuevo para confirmar",
  busyLabel,
  busy,
  disabled,
  onConfirm,
  durationMs = 1100,
}: {
  label: string;
  armedLabel?: string;
  busyLabel: string;
  busy: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  durationMs?: number;
}) {
  const reduce = useReducedMotion();
  const progress = useMotionValue(0);
  const width = useTransform(progress, (p) => `${p * 100}%`);
  const reveal = useTransform(progress, (p) => `inset(0 ${100 - p * 100}% 0 0)`);
  const controls = useRef<ReturnType<typeof animate> | null>(null);
  const [holding, setHolding] = useState(false);
  const [armed, setArmed] = useState(false);

  function start() {
    if (disabled || busy) return;
    setHolding(true);
    haptic(8);
    controls.current?.stop();
    controls.current = animate(progress, 1, {
      duration: (durationMs / 1000) * (1 - progress.get()),
      ease: "linear",
      onComplete: () => {
        setHolding(false);
        haptic(30);
        onConfirm();
        // Si la acción falla y la hoja sigue abierta, el botón vuelve a quedar listo
        controls.current = animate(progress, 0, { delay: 0.8, duration: 0.3 });
      },
    });
  }

  function cancel() {
    if (!holding) return;
    setHolding(false);
    controls.current?.stop();
    controls.current = animate(progress, 0, { duration: reduce ? 0 : 0.25, ease: "easeOut" });
  }

  return (
    <button
      type="button"
      disabled={disabled || busy}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        start();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => {
        // detail === 0: clic sintético de teclado o de tecnología asistiva
        if (e.detail !== 0) return;
        if (armed) onConfirm();
        else setArmed(true);
      }}
      onBlur={() => setArmed(false)}
      className={cn(
        "relative flex h-12 w-full select-none items-center justify-center overflow-hidden rounded-[16px] text-[15px] font-bold",
        "bg-destructive/12 text-destructive ring-1 ring-destructive/25 transition-transform [-webkit-touch-callout:none]",
        "disabled:opacity-40",
        holding && "scale-[0.98]",
      )}
    >
      <span className="relative">
        {busy ? busyLabel : armed ? armedLabel : label}
      </span>
      {/* Relleno y, encima, el mismo texto en blanco recortado al relleno: se
          "revela" a medida que avanza. Van después para pintarse por encima. */}
      <motion.span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 bg-destructive"
        style={{ width }}
      />
      <motion.span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center text-white"
        style={{ clipPath: reveal }}
      >
        {busy ? busyLabel : label}
      </motion.span>
    </button>
  );
}
