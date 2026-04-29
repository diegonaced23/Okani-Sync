import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

/** Combina clases Tailwind sin conflictos. Requerida por shadcn/ui. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formatea un timestamp en fecha larga: "lunes, 28 de abril de 2026" */
export function formatDate(timestamp: number): string {
  return format(new Date(timestamp), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es });
}

/** Formatea un timestamp en fecha corta: "28 abr. 2026" */
export function formatDateShort(timestamp: number): string {
  return format(new Date(timestamp), "d MMM yyyy", { locale: es });
}

/** Formatea un timestamp como "hace 3 días", "en 2 horas", etc. */
export function formatRelative(timestamp: number): string {
  return formatDistanceToNow(new Date(timestamp), { addSuffix: true, locale: es });
}

/** Trunca un string largo añadiendo "..." al final. */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength - 3)}...`;
}

/** Genera un UUID v4. */
export function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
