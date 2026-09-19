"use client";

import { useId } from "react";
import { motion } from "framer-motion";
import { SPRING } from "@/lib/ios";
import { cn } from "@/lib/utils";

/** Control segmentado estilo iOS: la opción activa se marca con una píldora que se desliza. */
export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  small,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  small?: boolean;
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-[14px] border border-border bg-[var(--surface-2)] p-1">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "touch-hit relative flex-1 rounded-[10px] py-2 transition-colors",
              small ? "text-[12px]" : "text-[13px]",
              active ? "font-bold text-foreground" : "font-semibold text-muted-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId={`${id}-pill`}
                className="absolute inset-0 rounded-[10px] bg-[var(--surface)] shadow-sm"
                transition={SPRING}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
