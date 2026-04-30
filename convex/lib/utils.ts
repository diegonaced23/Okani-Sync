/** Retorna "YYYY-MM" para un timestamp. Usado en mutations de Convex. */
export function toMonthString(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** Genera un UUID v4 para transferGroupId. Disponible en el runtime de Convex. */
export function generateId(): string {
  return crypto.randomUUID();
}
