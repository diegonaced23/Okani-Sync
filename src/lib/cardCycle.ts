// Espejo de `getBillingCycleDates` / `getNextPaymentTs` de convex/lib/cardHelpers.ts,
// para mostrar en el formulario las fechas reales que calculará el backend.
// Si cambia la lógica allá, hay que replicarla aquí.

export type CardBrand = "visa" | "mastercard" | "amex" | "diners" | "otro";

export const CARD_BRANDS: readonly { value: CardBrand; label: string }[] = [
  { value: "visa", label: "Visa" },
  { value: "mastercard", label: "Mastercard" },
  { value: "amex", label: "American Express" },
  { value: "diners", label: "Diners Club" },
  { value: "otro", label: "Otra" },
];

export const CARD_BRAND_LABELS: Record<CardBrand, string> = Object.fromEntries(
  CARD_BRANDS.map((b) => [b.value, b.label])
) as Record<CardBrand, string>;

/** Próximo corte (fin del día) según el día de corte, clampeado al último día del mes. */
export function getNextCutoffTs(cutoffDay: number, now: Date = new Date()): number {
  const year = now.getFullYear();
  const month = now.getMonth();
  const cutoffOf = (y: number, m: number) =>
    Math.min(cutoffDay, new Date(y, m + 1, 0).getDate());

  let nextYear = year;
  let nextMonth = month;
  if (now.getDate() >= cutoffOf(year, month)) {
    nextYear = month === 11 ? year + 1 : year;
    nextMonth = month === 11 ? 0 : month + 1;
  }
  return new Date(nextYear, nextMonth, cutoffOf(nextYear, nextMonth), 23, 59, 59, 999).getTime();
}

/** El pago cae en el mes siguiente al próximo corte (misma regla que el backend). */
export function getNextPaymentTs(paymentDay: number, nextCutoffTs: number): number {
  const cutoffDate = new Date(nextCutoffTs);
  const cutoffMonth = cutoffDate.getMonth();
  const cutoffYear = cutoffDate.getFullYear();
  const payYear = cutoffMonth === 11 ? cutoffYear + 1 : cutoffYear;
  const payMonth = cutoffMonth === 11 ? 0 : cutoffMonth + 1;
  const lastDay = new Date(payYear, payMonth + 1, 0).getDate();
  return new Date(payYear, payMonth, Math.min(paymentDay, lastDay), 12, 0, 0).getTime();
}

/** Nombre sugerido para la tarjeta: "Visa Bancolombia ···1234". */
export function autoCardName(brand: CardBrand, bankName: string, lastFour: string): string {
  const parts = [
    brand === "otro" ? "" : CARD_BRAND_LABELS[brand],
    bankName.trim(),
    lastFour.length === 4 ? `···${lastFour}` : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "Tarjeta de crédito";
}

// ─── Tasa de interés ─────────────────────────────────────────────────────────
// Los bancos colombianos publican la tasa efectiva anual (E.A.); el backend
// guarda la mensual vencida (m.v.) como fracción. Ambas funciones usan fracciones.

/** E.A. → m.v.: (1 + ea)^(1/12) − 1 */
export function eaToMonthly(ea: number): number {
  return Math.pow(1 + ea, 1 / 12) - 1;
}

/** m.v. → E.A.: (1 + mv)^12 − 1 */
export function monthlyToEa(mv: number): number {
  return Math.pow(1 + mv, 12) - 1;
}
