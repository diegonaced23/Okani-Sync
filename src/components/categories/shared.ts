import type { Doc } from "../../../convex/_generated/dataModel";

// Utilidades de estilo iOS compartidas con otros módulos (viven en src/lib/ios.ts)
export { EASE_OUT_EXPO, GLASS_SURFACE, OVERFLOW_ROW, SPRING, haptic, isLightColor, tint } from "@/lib/ios";

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
