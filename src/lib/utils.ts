import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

/** Combina clases Tailwind sin conflictos. Requerida por shadcn/ui. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formatea un timestamp en fecha larga: "lunes, 28 de abril de 2026" */
export function formatDate(timestamp: number): string {
  return format(new Date(timestamp), "EEEE, d 'de' MMMM 'de' yyyy", {
    locale: es,
  });
}

/** Formatea un timestamp en fecha corta: "28 abr. 2026" */
export function formatDateShort(timestamp: number): string {
  return format(new Date(timestamp), "d MMM yyyy", { locale: es });
}

/** Formatea un timestamp como "hace 3 días", "en 2 horas", etc. */
export function formatRelative(timestamp: number): string {
  return formatDistanceToNow(new Date(timestamp), {
    addSuffix: true,
    locale: es,
  });
}

/** Formatea un string "YYYY-MM" como "Abril 2026" */
export function formatMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  return format(date, "MMMM yyyy", { locale: es });
}

/** Retorna el array de los últimos N meses como strings "YYYY-MM". */
export function lastNMonths(n: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    );
  }
  return months.reverse();
}

/** Trunca un string largo añadiendo "..." al final. */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength - 3)}...`;
}

/** Genera un UUID v4 simple (usa crypto.randomUUID si está disponible). */
export function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback básico
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
