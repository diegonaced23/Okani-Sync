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

/** Añade N meses a un timestamp. */
export function addMonths(timestamp: number, months: number): number {
  const date = new Date(timestamp);
  date.setMonth(date.getMonth() + months);
  return date.getTime();
}
