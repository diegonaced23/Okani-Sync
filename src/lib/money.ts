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

// ─── Amortización de deudas ──────────────────────────────────────────────────

export interface AmortizationRow {
  monthNumber: number;
  month: string;           // "YYYY-MM"
  payment: number;         // centavos pagados este período
  interest: number;        // centavos de interés
  principal: number;       // centavos de capital amortizado
  remainingBalance: number;// centavos de saldo al final del período
}

export interface AmortizationResult {
  schedule: AmortizationRow[];
  totalInterest: number;  // centavos
  totalPayments: number;  // número de cuotas hasta liquidar
  payoffDate: string;     // "YYYY-MM"
}

function advanceMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Genera el plan de amortización de una deuda de cuota fija.
 *
 * @param principalCents      - Saldo actual pendiente en centavos.
 * @param monthlyRate         - Tasa mensual decimal (ej: 0.025 = 2.5%).
 * @param monthlyPaymentCents - Cuota mensual fija en centavos.
 * @param startMonth          - Mes del primer pago, formato "YYYY-MM".
 * @param maxMonths           - Límite de iteración (default 360 = 30 años).
 *
 * Retorna `null` si los datos son insuficientes o la cuota no cubre los intereses
 * del primer período (amortización negativa — el saldo nunca bajaría).
 */
export function calculateLoanAmortization(
  principalCents: number,
  monthlyRate: number,
  monthlyPaymentCents: number,
  startMonth: string,
  maxMonths = 360,
): AmortizationResult | null {
  if (principalCents <= 0 || monthlyPaymentCents <= 0) return null;

  const firstInterest = Math.round(principalCents * monthlyRate);
  if (monthlyRate > 0 && monthlyPaymentCents <= firstInterest) return null;

  const schedule: AmortizationRow[] = [];
  let balance = principalCents;
  let currentMonth = startMonth;
  let totalInterest = 0;

  for (let i = 1; i <= maxMonths && balance > 0; i++) {
    const interest = Math.round(balance * monthlyRate);
    const payment = Math.min(monthlyPaymentCents, balance + interest);
    const principal = payment - interest;
    balance = Math.max(0, balance - principal);
    totalInterest += interest;

    schedule.push({
      monthNumber: i,
      month: currentMonth,
      payment,
      interest,
      principal,
      remainingBalance: balance,
    });

    currentMonth = advanceMonth(currentMonth);
    if (balance === 0) break;
  }

  return {
    schedule,
    totalInterest,
    totalPayments: schedule.length,
    payoffDate: schedule[schedule.length - 1]?.month ?? startMonth,
  };
}

// ─── Utilidades de fecha/mes ──────────────────────────────────────────────────

/**
 * Convierte un string "YYYY-MM-DD" a timestamp en hora local (mediodía).
 *
 * Por qué mediodía y no medianoche:
 *   new Date("YYYY-MM-DD") la spec lo parsea como UTC medianoche.
 *   En zonas UTC negativas (ej: Colombia UTC-5) eso es el día anterior a las 19:00 local,
 *   por lo que el timestamp guardado representa el día equivocado.
 *   Usando "T12:00:00" (sin sufijo Z) JavaScript lo trata como hora local,
 *   y el mediodía garantiza que ningún cambio de horario de verano (±1h) desfase el día.
 */
export function dateStrToTs(dateStr: string): number {
  return new Date(dateStr + "T12:00:00").getTime();
}

/**
 * Convierte un timestamp a string "YYYY-MM-DD" usando la zona horaria local.
 *
 * NO usar toISOString().substring(0, 10) porque devuelve la fecha en UTC,
 * que puede diferir un día respecto a la fecha local en zonas UTC negativas.
 */
export function tsToDateStr(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Retorna la fecha de hoy como "YYYY-MM-DD" en hora local. */
export function todayStr(): string {
  return tsToDateStr(Date.now());
}

// ─── Simulación FIFO de pago de tarjeta ──────────────────────────────────────

/**
 * Simula qué cuotas quedan saldadas si se aplica `paymentAmount` al saldo
 * de una tarjeta, replicando la lógica FIFO de `recomputeInstallmentsPaid`.
 *
 * No escribe nada a la base de datos — es pura y usable en el cliente.
 *
 * @param allInstallments - Todas las cuotas de la tarjeta (pagadas + pendientes),
 *   necesarias para calcular `totalCargado` y determinar la posición FIFO.
 * @param currentBalance  - Saldo actual de la tarjeta (centavos).
 * @param paymentAmount   - Monto a pagar (centavos). Se clampea a `currentBalance`.
 */
export function simulateFIFOPayment<
  T extends { amount: number; dueDate: number; paid: boolean },
>(
  allInstallments: T[],
  currentBalance: number,
  paymentAmount: number,
): { newlyPaid: T[]; stillUnpaid: T[]; newBalance: number } {
  const effectivePayment = Math.min(paymentAmount, currentBalance);
  const newBalance = Math.max(0, currentBalance - effectivePayment);

  // totalCargado ≡ Σ gasto_tarjeta.amount (cada cuota tiene su tx gasto_tarjeta)
  const totalCargado = allInstallments.reduce((s, i) => s + i.amount, 0);
  const newTotalPagado = Math.max(0, totalCargado - newBalance);

  // FIFO: ordenar por dueDate ascendente y marcar las primeras que caben
  const sorted = [...allInstallments].sort((a, b) => a.dueDate - b.dueDate);
  let acumulado = 0;
  const willBePaid = new Set<number>();
  for (let i = 0; i < sorted.length; i++) {
    if (acumulado + sorted[i].amount <= newTotalPagado) {
      willBePaid.add(i);
      acumulado += sorted[i].amount;
    }
  }

  return {
    newlyPaid:   sorted.filter((inst, i) => !inst.paid && willBePaid.has(i)),
    stillUnpaid: sorted.filter((inst, i) => !inst.paid && !willBePaid.has(i)),
    newBalance,
  };
}

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
