// Utilidades del lenguaje visual estilo iOS / liquid glass que comparten los
// módulos rediseñados (categorías, recurrentes, …).

/** Toque háptico corto. iOS Safari no implementa vibrate: ahí es un no-op. */
export function haptic(ms = 10) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try { navigator.vibrate(ms); } catch { /* sin permiso: se ignora */ }
  }
}

/** Mezcla un color con transparencia (acepta hex u oklch). */
export function tint(color: string, pct: number) {
  return `color-mix(in oklch, ${color} ${pct}%, transparent)`;
}

/** true si un color hex es lo bastante claro como para llevar texto oscuro encima. */
export function isLightColor(hex: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4;
}

/**
 * Vidrio al estilo iOS para superficies de lista, igual que RecentTransactionsCard:
 * translúcido en móvil sobre la aurora; superficie sólida en desktop.
 * No animar `filter` sobre estos contenedores: rompe el backdrop-filter.
 */
export const GLASS_SURFACE =
  "border border-white/50 bg-[color-mix(in_oklch,var(--card)_72%,transparent)] backdrop-blur-xl backdrop-saturate-150 shadow-sm dark:border-white/10 md:border-border md:bg-card md:backdrop-blur-none";

/**
 * Fila de chips o muestras que desborda el ancho. Con dedo (pointer-coarse) se
 * desliza en horizontal, sangrando hasta el borde de la hoja y con los extremos
 * desvanecidos para insinuar que hay más. Con mouse (pointer-fine) no hay gesto
 * para desplazarla si la rueda no es horizontal, así que pasa a varias líneas.
 */
export const OVERFLOW_ROW =
  "flex gap-2 " +
  "pointer-coarse:-mx-5 pointer-coarse:overflow-x-auto pointer-coarse:px-5 pointer-coarse:[scrollbar-width:none] pointer-coarse:[&::-webkit-scrollbar]:hidden " +
  "pointer-coarse:[mask-image:linear-gradient(to_right,transparent,black_20px,black_calc(100%-20px),transparent)] " +
  "pointer-fine:flex-wrap";

export const EASE_OUT_EXPO = [0.22, 1, 0.36, 1] as const;
export const SPRING = { type: "spring", stiffness: 520, damping: 38, mass: 0.8 } as const;

/** Etiqueta de sección de formulario en mayúsculas pequeñas, como en Ajustes de iOS. */
export const FIELD_LABEL =
  "block px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground";
