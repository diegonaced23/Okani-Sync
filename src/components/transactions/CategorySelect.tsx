"use client";

import { useId } from "react";
import { motion } from "framer-motion";
import type { Doc } from "../../../convex/_generated/dataModel";
import { CategoryIcon } from "@/lib/category-icons";
import { cn } from "@/lib/utils";
import { OVERFLOW_ROW, SPRING, haptic, tint } from "./shared";

interface CategorySelectProps {
  id?: string;
  /** Nombre accesible del grupo: el visible cambia según el tipo de movimiento. */
  ariaLabel?: string;
  value: string;
  onValueChange: (v: string) => void;
  categories: Doc<"categories">[];
}

/**
 * Categoría como fila de fichas en vez de un desplegable: se ve de un golpe lo que
 * hay y se elige con un toque, igual que en el resto de las hojas de la app. Con
 * dedo la fila se desliza; con ratón pasa a varias líneas (OVERFLOW_ROW).
 *
 * Mantiene las mismas props que el `Select` que había antes, así que los cinco
 * formularios que la usan quedaron actualizados sin tocar cada sitio.
 */
export function CategorySelect({ id, ariaLabel = "Categoría", value, onValueChange, categories }: CategorySelectProps) {
  const groupId = useId();

  return (
    <div id={id} role="radiogroup" aria-label={ariaLabel} className={OVERFLOW_ROW}>
      <button
        type="button"
        role="radio"
        aria-checked={value === ""}
        onClick={() => { haptic(); onValueChange(""); }}
        className={cn(
          "flex shrink-0 items-center rounded-[14px] border px-3 py-2 text-[13px] font-semibold transition-[background-color,border-color,transform] active:scale-95",
          value === ""
            ? "border-foreground/30 bg-muted text-foreground"
            : "border-border bg-[var(--surface-2)] text-muted-foreground",
        )}
      >
        Sin categoría
      </button>

      {categories.map((cat) => {
        const active = value === cat._id;
        return (
          <button
            key={cat._id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => { haptic(); onValueChange(cat._id); }}
            className={cn(
              "relative flex shrink-0 items-center gap-2 rounded-[14px] border px-3 py-2 text-[13px] font-semibold transition-[border-color,transform] active:scale-95",
              active ? "border-transparent text-foreground" : "border-border bg-[var(--surface-2)] text-muted-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId={`${groupId}-cat-pill`}
                className="absolute inset-0 rounded-[14px]"
                style={{
                  background: tint(cat.color, 14),
                  boxShadow: `inset 0 0 0 1.5px ${tint(cat.color, 50)}`,
                }}
                transition={SPRING}
              />
            )}
            <CategoryIcon
              name={cat.icon}
              aria-hidden
              className="relative h-4 w-4 shrink-0"
              style={{ color: cat.color }}
              strokeWidth={1.8}
            />
            <span className="relative truncate">{cat.name}</span>
          </button>
        );
      })}
    </div>
  );
}
