/**
 * Utilidades financieras de Okany Sync
 *
 * Convención de montos: todos los valores en la BD se guardan como enteros ×100
 * (centavos). Esto evita errores de punto flotante en sumas acumuladas.
 *
 * API pública:
 *  toCents(n)            → almacenar en BD
 *  fromCents(n)          → leer de la BD
 *  formatCurrency(n, c)  → mostrar en UI (recibe valor humano, no centavos)
 *  formatCents(n, c)     → mostrar en UI (recibe centavos de BD)
 *  calculateInstallment  → cuota con interés compuesto
 *  convertCurrency       → convierte entre monedas usando tasa dada
 */

// ─── Conversión BD ↔ UI ───────────────────────────────────────────────────────

/** Convierte un valor humano (1500.50) a entero de BD (150050). */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/** Convierte un entero de BD (150050) a valor humano (1500.50). */
export function fromCents(cents: number): number {
  return cents / 100;
}

// ─── Formato en UI ───────────────────────────────────────────────────────────

/**
 * Formatea un valor humano (no centavos) en la moneda dada con locale es-CO.
 * Ejemplo: formatCurrency(1500.5, "COP") → "$ 1.501"
 */
export function formatCurrency(amount: number, currency = "COP"): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    minimumFractionDigits: currency === "COP" ? 0 : 2,
    maximumFractionDigits: currency === "COP" ? 0 : 2,
  }).format(amount);
}

/**
 * Formatea directamente un valor en centavos (BD) en la moneda dada.
 * Ejemplo: formatCents(150050, "COP") → "$ 1.501"
 */
export function formatCents(cents: number, currency = "COP"): string {
  return formatCurrency(fromCents(cents), currency);
}

// ─── Cálculo de cuota con interés compuesto ───────────────────────────────────

export interface InstallmentScheduleItem {
  installmentNumber: number;
  amount: number;         // cuota total en centavos
  principalAmount: number;
  interestAmount: number;
  remainingPrincipal: number;
}

export interface InstallmentResult {
  amountPerInstallment: number;   // en centavos
  totalWithInterest: number;      // en centavos
  totalInterest: number;          // en centavos
  schedule: InstallmentScheduleItem[];
}

/**
 * Calcula la cuota mensual con interés compuesto y genera el cronograma
 * completo con desglose capital / interés por cuota.
 *
 * Fórmula: M = P × (i × (1+i)^n) / ((1+i)^n − 1)
 *
 * @param principalCents - Monto base de la compra en centavos
 * @param monthlyRate    - Tasa mensual decimal (0.08 = 8%)
 * @param installments   - Número de cuotas
 */
export function calculateInstallment(
  principalCents: number,
  monthlyRate: number,
  installments: number
): InstallmentResult {
  // Compra sin interés
  if (monthlyRate === 0 || installments === 1) {
    const amount = Math.round(principalCents / installments);
    const schedule: InstallmentScheduleItem[] = Array.from(
      { length: installments },
      (_, i) => ({
        installmentNumber: i + 1,
        amount,
        principalAmount: amount,
        interestAmount: 0,
        remainingPrincipal: principalCents - amount * (i + 1),
      })
    );
    return {
      amountPerInstallment: amount,
      totalWithInterest: principalCents,
      totalInterest: 0,
      schedule,
    };
  }

  const r = monthlyRate;
  const n = installments;
  const factor = Math.pow(1 + r, n);
  const monthlyPayment = (principalCents * (r * factor)) / (factor - 1);
  const amountPerInstallment = Math.round(monthlyPayment);

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
      // Evitar negativos por redondeo en la última cuota
      remainingPrincipal: Math.max(0, remainingPrincipal),
    });
  }

  const totalWithInterest = amountPerInstallment * n;
  const totalInterest = totalWithInterest - principalCents;

  return {
    amountPerInstallment,
    totalWithInterest,
    totalInterest,
    schedule,
  };
}

// ─── Conversión multi-moneda ─────────────────────────────────────────────────

/**
 * Convierte un monto en centavos de una moneda a otra usando la tasa dada.
 * La tasa expresa cuántas unidades de `toCurrency` equivalen a 1 de `fromCurrency`.
 *
 * Ejemplo: convertCurrency(100000, 4200) → 1 USD a 4200 COP = 4.200.000 centavos COP
 */
export function convertCurrency(amountCents: number, rate: number): number {
  return Math.round(amountCents * rate);
}

// ─── Utilidades de fecha/mes ──────────────────────────────────────────────────

/**
 * Retorna el string "YYYY-MM" para el timestamp dado.
 * Usa la zona horaria local del navegador.
 */
export function toMonthString(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** Retorna el mes actual en formato "YYYY-MM". */
export function currentMonth(): string {
  return toMonthString(Date.now());
}

/** Formatea un string "YYYY-MM" como "Abril 2026". */
export function formatMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
}
