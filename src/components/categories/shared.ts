import type { Doc } from "../../../convex/_generated/dataModel";

export type Category = Doc<"categories">;
export type CategoryType = Category["type"];
/** Pestaña de la lista: las categorías "ambos" aparecen en las dos */
export type CategoryTab = "gasto" | "ingreso";

export const TYPE_LABELS: Record<CategoryType, string> = {
  gasto: "Gasto",
  ingreso: "Ingreso",
  ambos: "Ambos",
};

export function inTab(cat: Pick<Category, "type">, tab: CategoryTab): boolean {
  return cat.type === tab || cat.type === "ambos";
}

export function isTypeCompatible(sourceType: CategoryType, targetType: CategoryType): boolean {
  if (sourceType === "ambos") return true;
  return targetType === sourceType || targetType === "ambos";
}

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

/** Etiquetas en español de los íconos: accesibilidad y búsqueda del selector. */
export const ICON_LABELS: Record<string, string> = {
  "utensils": "Comida",
  "shopping-cart": "Mercado",
  "car": "Carro",
  "plane": "Viajes",
  "home": "Hogar",
  "zap": "Servicios",
  "heart-pulse": "Salud",
  "music": "Música",
  "book-open": "Educación",
  "shirt": "Ropa",
  "coffee": "Café",
  "dumbbell": "Gimnasio",
  "paw-print": "Mascotas",
  "baby": "Bebé",
  "scissors": "Belleza",
  "phone": "Celular",
  "briefcase": "Trabajo",
  "laptop": "Tecnología",
  "trending-up": "Inversiones",
  "gift": "Regalos",
  "building-2": "Edificio",
  "piggy-bank": "Ahorro",
  "banknote": "Efectivo",
  "coins": "Monedas",
  "star": "Favorito",
  "circle-ellipsis": "Otros",
  "tag": "Etiqueta",
  "folder": "Carpeta",
};

export interface CategorySuggestion {
  name: string;
  icon: string;
  color: string;
  type: CategoryType;
}

/** Atajos del formulario de creación: rellenan nombre, ícono y color de una vez. */
export const SUGGESTIONS: CategorySuggestion[] = [
  { name: "Mascotas", icon: "paw-print", color: "#fb923c", type: "gasto" },
  { name: "Gimnasio", icon: "dumbbell", color: "#22d3ee", type: "gasto" },
  { name: "Café", icon: "coffee", color: "#f97316", type: "gasto" },
  { name: "Mercado", icon: "shopping-cart", color: "#4ade80", type: "gasto" },
  { name: "Viajes", icon: "plane", color: "#38bdf8", type: "gasto" },
  { name: "Celular", icon: "phone", color: "#8b5cf6", type: "gasto" },
  { name: "Belleza", icon: "scissors", color: "#f472b6", type: "gasto" },
  { name: "Bebé", icon: "baby", color: "#fbbf24", type: "gasto" },
  { name: "Bonos", icon: "coins", color: "#fbbf24", type: "ingreso" },
  { name: "Ventas", icon: "banknote", color: "#34d399", type: "ingreso" },
  { name: "Arriendos", icon: "building-2", color: "#a78bfa", type: "ingreso" },
  { name: "Intereses", icon: "piggy-bank", color: "#4ade80", type: "ingreso" },
];
