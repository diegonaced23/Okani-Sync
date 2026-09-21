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

/** Miniatura de una cuenta (su inicial) o tarjeta (el ícono) sobre su color. */
export function SourceThumb({
  color,
  name,
  isCard,
  size = "sm",
}: {
  color: string;
  name: string;
  isCard?: boolean;
  size?: "sm" | "lg";
}) {
  const visual = sourceVisual(color);
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center ring-1 ring-white/20",
        size === "lg" ? "h-9 w-9 rounded-[11px]" : "h-6 w-6 rounded-[8px]",
      )}
      style={{ background: visual.background, color: visual.darkText ? "oklch(0.18 0.02 260)" : "white" }}
      aria-hidden="true"
    >
      {isCard
        ? <CreditCard className={size === "lg" ? "h-[18px] w-[18px]" : "h-3.5 w-3.5"} />
        : <span className={cn("font-extrabold", size === "lg" ? "text-[13px]" : "text-[10px]")}>{name.charAt(0)}</span>}
    </span>
  );
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
      <SourceThumb color={color} name={name} isCard={isCard} />
      <span className="flex flex-col leading-tight">
        <span className="text-[13px] font-semibold">{name}</span>
        <span className="text-[10px] text-muted-foreground">{detail}</span>
      </span>
    </button>
  );
}
