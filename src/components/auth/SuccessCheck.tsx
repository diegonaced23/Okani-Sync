"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Check que se dibuja trazo a trazo: confirma que la acción salió bien en el
 * instante entre la respuesta del servidor y la navegación, que de otro modo
 * se vive como un spinner que no termina.
 */
export function SuccessCheck({ className = "size-4" }: { className?: string }) {
  const reduceMotion = useReducedMotion();

  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <motion.path
        d="M5 12.5l4.5 4.5L19 7.5"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduceMotion ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  );
}
