/**
 * Utilidades financieras para el runtime de Convex (mutations/actions).
 * Duplica la lógica de src/lib/money.ts sin depender de APIs de browser.
 * Montos en centavos (×100) igual que en el schema.
 */

export interface InstallmentScheduleItem {
  installmentNumber: number;
  amount: number;
  principalAmount: number;
  interestAmount: number;
  remainingPrincipal: number;
}

export interface InstallmentResult {
  amountPerInstallment: number;
  totalWithInterest: number;
  totalInterest: number;
  schedule: InstallmentScheduleItem[];
}

/**
 * Calcula cuota mensual con interés compuesto y genera cronograma completo.
 * Fórmula: M = P × (i × (1+i)^n) / ((1+i)^n − 1)
 *
 * @param principalCents - Monto base en centavos
 * @param monthlyRate    - Tasa mensual decimal (0.08 = 8%)
 * @param installments   - Número de cuotas
 */
export function calculateInstallment(
  principalCents: number,
  monthlyRate: number,
  installments: number
): InstallmentResult {
  if (monthlyRate === 0 || installments === 1) {
    const amount = Math.round(principalCents / installments);
    return {
      amountPerInstallment: amount,
      totalWithInterest: principalCents,
      totalInterest: 0,
      schedule: Array.from({ length: installments }, (_, i) => ({
        installmentNumber: i + 1,
        amount,
        principalAmount: amount,
        interestAmount: 0,
        remainingPrincipal: Math.max(0, principalCents - amount * (i + 1)),
      })),
    };
  }

  const r = monthlyRate;
  const n = installments;
  const factor = Math.pow(1 + r, n);
  const amountPerInstallment = Math.round((principalCents * (r * factor)) / (factor - 1));

  const schedule: InstallmentScheduleItem[] = [];
  let remainingPrincipal = principalCents;

  for (let i = 1; i <= n; i++) {
    const interestAmount = Math.round(remainingPrincipal * r);
    const principalAmount = amountPerInstallment - interestAmount;
    remainingPrincipal = remainingPrincipal - principalAmount;
    schedule.push({
      installmentNumber: i,
      amount: amountPerInstallment,
      principalAmount,
      interestAmount,
      remainingPrincipal: Math.max(0, remainingPrincipal),
    });
  }

  return {
    amountPerInstallment,
    totalWithInterest: amountPerInstallment * n,
    totalInterest: amountPerInstallment * n - principalCents,
    schedule,
  };
}

// ─── Conversión multi-moneda ─────────────────────────────────────────────────

/**
 * Construye un mapa rápido fromCurrency → rate para conversiones a `toCurrency`.
 * Filtra solo las tasas que apuntan a la moneda destino, reduciendo la búsqueda a O(1).
 */
export type RateMap = Map<string, number>;

export function buildRateMap(
  rates: { fromCurrency: string; toCurrency: string; rate: number }[],
  toCurrency: string
): RateMap {
  return new Map(
    rates.filter((r) => r.toCurrency === toCurrency).map((r) => [r.fromCurrency, r.rate])
  );
}

/**
 * Convierte `amountCents` de `fromCurrency` a `toCurrency` usando el mapa de tasas.
 * Si no hay tasa disponible, devuelve el monto sin convertir y `hasRate: false`.
 */
export function convertAmount(
  amountCents: number,
  fromCurrency: string,
  toCurrency: string,
  rateMap: RateMap
): { converted: number; hasRate: boolean } {
  if (fromCurrency === toCurrency) return { converted: amountCents, hasRate: true };
  const rate = rateMap.get(fromCurrency);
  if (rate === undefined) return { converted: amountCents, hasRate: false };
  return { converted: Math.round(amountCents * rate), hasRate: true };
}

/**
 * Añade N meses a un timestamp preservando la hora exacta.
 * Si el día de origen no existe en el mes destino (ej: 31-ene + 1 mes),
 * se clampea al último día del mes destino (28 feb, no 3 mar).
 */
export function addMonths(timestamp: number, months: number): number {
  const d = new Date(timestamp);
  const originalDay = d.getDate();
  const rawMonth = d.getMonth() + months;
  const targetYear = d.getFullYear() + Math.floor(rawMonth / 12);
  const targetMonth = ((rawMonth % 12) + 12) % 12;
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  return new Date(
    targetYear,
    targetMonth,
    Math.min(originalDay, lastDay),
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
    d.getMilliseconds(),
  ).getTime();
}
