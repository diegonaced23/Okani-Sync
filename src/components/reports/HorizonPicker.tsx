"use client";

import { motion } from "framer-motion";
import { GLASS_SURFACE, SPRING, haptic } from "@/lib/ios";
import { cn } from "@/lib/utils";

/**
 * Cuántos meses abarca un reporte. Es un grupo de opciones, no pestañas: se anuncia
 * como radiogroup y se recorre con las flechas, igual que las píldoras de tipo en
 * movimientos.
 *
 * Existe porque los horizontes estaban fijos en el código: el histórico de
 * presupuestos siempre traía seis meses y el libro contable siempre uno, aunque el
 * backend acepta hasta doce.
 */
export function HorizonPicker({
  value,
  options,
  onChange,
  label,
  layoutId,
  size = "md",
}: {
  value: number;
  options: number[];
  onChange: (months: number) => void;
  /** Nombre accesible del grupo: qué se está acotando */
  label: string;
  /** Debe ser único en la página: dos grupos con el mismo id se pelean la píldora */
  layoutId: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex gap-1 rounded-[14px] p-1",
        GLASS_SURFACE,
        size === "sm" && "rounded-[12px]",
      )}
      onKeyDown={(e) => {
        const current = options.indexOf(value);
        let next = -1;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          next = (current + 1) % options.length;
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          next = (current - 1 + options.length) % options.length;
        }
        if (next !== -1) {
          onChange(options[next]);
          (e.currentTarget.querySelectorAll('[role="radio"]')[next] as HTMLElement)?.focus();
        }
      }}
    >
      {options.map((months) => {
        const active = months === value;
        return (
          <button
            key={months}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => { haptic(); onChange(months); }}
            className={cn(
              "touch-hit relative rounded-[10px] px-2.5 tabular-nums transition-colors",
              size === "sm" ? "py-1 text-[11px]" : "py-1.5 text-[12px]",
              active ? "font-bold text-foreground" : "font-semibold text-muted-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-[10px] bg-[var(--surface)] shadow-[0_2px_8px_-4px_rgb(0_0_0/0.25)] dark:bg-white/10"
                transition={SPRING}
              />
            )}
            <span className="relative">
              {months} {months === 1 ? "mes" : "meses"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
