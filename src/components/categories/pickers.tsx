"use client";

import { useId } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CategoryIcon } from "@/components/ui/category-icon";
import { CATEGORY_ICONS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { ICON_LABELS, SPRING, TYPE_LABELS, haptic, tint, type CategoryType } from "./shared";

// ─── Vista previa en vivo ─────────────────────────────────────────────────────

/**
 * Burbuja de vidrio con el ícono, el halo del color elegido y el nombre. Cambia
 * mientras el usuario edita: el ícono entra con un rebote y el halo se funde.
 */
export function CategoryPreview({
  name,
  icon,
  color,
  type,
}: {
  name: string;
  icon: string;
  color: string;
  type: CategoryType;
}) {
  const reduce = useReducedMotion();
  return (
    <div className="relative flex flex-col items-center gap-3 pb-1 pt-2" aria-hidden="true">
      {/* Halo: capa aparte con blur fijo; solo transiciona su color, nunca el filter.
          Los colores van por CSS: Framer Motion no sabe interpolar color-mix(). */}
      <span
        className="pointer-events-none absolute top-0 h-28 w-28 rounded-full blur-2xl transition-[background-color] duration-500"
        style={{ backgroundColor: tint(color, 55) }}
      />
      <span
        className="relative flex h-[76px] w-[76px] items-center justify-center rounded-[26px] border border-white/40 backdrop-blur-xl transition-[background-color,color,box-shadow] duration-300 dark:border-white/15"
        style={{
          backgroundColor: tint(color, 20),
          color,
          boxShadow: `0 12px 32px -10px ${tint(color, 70)}, inset 0 1px 0 rgba(255,255,255,0.35)`,
        }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={icon}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.4, rotate: -25 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.4, rotate: 25 }}
            transition={reduce ? { duration: 0.12 } : { type: "spring", stiffness: 600, damping: 22 }}
            className="flex"
          >
            <CategoryIcon name={icon} className="h-9 w-9" strokeWidth={2} />
          </motion.span>
        </AnimatePresence>
      </span>
      <div className="relative flex flex-col items-center gap-1 text-center">
        <p className={cn(
          "max-w-[16rem] truncate text-lg font-extrabold tracking-tight",
          name.trim() ? "text-foreground" : "text-muted-foreground/60",
        )}>
          {name.trim() || "Nueva categoría"}
        </p>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] transition-colors duration-300"
          style={{ background: tint(color, 16), color }}
        >
          {TYPE_LABELS[type]}
        </span>
      </div>
    </div>
  );
}

// ─── Control segmentado de tipo ───────────────────────────────────────────────

const TYPE_OPTIONS: CategoryType[] = ["gasto", "ingreso", "ambos"];

export function TypeSegmented({
  value,
  onChange,
}: {
  value: CategoryType;
  onChange: (t: CategoryType) => void;
}) {
  const id = useId();
  return (
    <div
      role="radiogroup"
      aria-label="Tipo de categoría"
      className="relative flex rounded-[14px] border border-border bg-[var(--surface-2)] p-1"
    >
      {TYPE_OPTIONS.map((t) => {
        const active = value === t;
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => { if (!active) { haptic(); onChange(t); } }}
            className={cn(
              "touch-hit relative flex-1 rounded-[10px] py-2 text-[13px] transition-colors",
              active ? "font-bold text-foreground" : "font-semibold text-muted-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId={`${id}-type`}
                className="absolute inset-0 rounded-[10px] bg-[var(--surface)] shadow-sm"
                transition={SPRING}
              />
            )}
            <span className="relative">{TYPE_LABELS[t]}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Íconos ───────────────────────────────────────────────────────────────────

export function IconPicker({
  value,
  onChange,
  color,
}: {
  value: string;
  onChange: (name: string) => void;
  color: string;
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label="Ícono" className="grid grid-cols-7 gap-1.5">
      {CATEGORY_ICONS.map((name) => {
        const selected = value === name;
        return (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={ICON_LABELS[name] ?? name}
            title={ICON_LABELS[name]}
            onClick={() => { haptic(); onChange(name); }}
            className={cn(
              "relative flex aspect-square items-center justify-center rounded-[13px] transition-[color,transform] active:scale-90",
              selected ? "" : "text-muted-foreground hover:text-foreground",
            )}
            style={selected ? { color } : undefined}
          >
            {selected && (
              <motion.span
                layoutId={`${id}-icon`}
                className="absolute inset-0 rounded-[13px]"
                style={{ background: tint(color, 18), boxShadow: `inset 0 0 0 1.5px ${tint(color, 55)}` }}
                transition={SPRING}
              />
            )}
            <CategoryIcon name={name} className="relative h-[19px] w-[19px]" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

// El selector de color vive en ui/ (lo comparten categorías y deudas)
export { ColorPicker } from "@/components/ui/color-picker";
