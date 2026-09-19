"use client";

import { CreditCard } from "lucide-react";
import { GRADIENT_MAP } from "@/lib/constants";
import { tint } from "@/lib/ios";
import { cn } from "@/lib/utils";

/**
 * Cuentas y tarjetas guardan en `color` una clave de gradiente (p. ej. "g-night");
 * las más viejas, un hex. Devuelve el fondo, un color plano para tintes y el texto.
 */
export function sourceVisual(color: string): { background: string; flat: string; darkText: boolean } {
  const g = GRADIENT_MAP[color];
  if (g) return { background: g.gradient, flat: g.preview, darkText: g.darkText };
  return {
    background: `linear-gradient(135deg, ${color}, color-mix(in oklch, ${color} 65%, black))`,
    flat: color,
    darkText: false,
  };
}

/** Chip seleccionable de cuenta o tarjeta, con su color como miniatura. Va dentro de un radiogroup. */
export function SourceChip({
  selected,
  onSelect,
  color,
  name,
  detail,
  isCard,
}: {
  selected: boolean;
  onSelect: () => void;
  color: string;
  name: string;
  detail: string;
  isCard?: boolean;
}) {
  const visual = sourceVisual(color);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-[14px] border px-3 py-2 text-left transition-[background-color,border-color,transform] active:scale-95",
        selected ? "text-foreground" : "border-border bg-[var(--surface-2)] text-muted-foreground",
      )}
      style={selected ? { background: tint(visual.flat, 16), borderColor: tint(visual.flat, 60) } : undefined}
    >
      <span
        className="flex h-6 w-6 items-center justify-center rounded-[8px] ring-1 ring-white/20"
        style={{ background: visual.background, color: visual.darkText ? "oklch(0.18 0.02 260)" : "white" }}
        aria-hidden="true"
      >
        {isCard ? <CreditCard className="h-3.5 w-3.5" /> : <span className="text-[10px] font-extrabold">{name.charAt(0)}</span>}
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-[13px] font-semibold">{name}</span>
        <span className="text-[10px] text-muted-foreground">{detail}</span>
      </span>
    </button>
  );
}
