/**
 * Qué cuenta como gasto y qué cuenta como ingreso del período.
 *
 * Hasta ahora esta regla vivía repetida en comentarios de `transactions.ts`
 * («misma definición que monthlySummary»), `accounts.ts` y `categories.ts`, y la
 * pantalla de reportes usaba otra por su cuenta: solo `type === "gasto"`. El
 * resultado era que «Gastos de septiembre» daba dos cifras distintas según por
 * dónde entraras. Aquí queda una sola.
 *
 * Hay dos lecturas legítimas del mismo mes, y el problema no era tener dos: era
 * no nombrarlas.
 *
 * - **Devengo** — lo que define este archivo: el gasto del período. Una compra a
 *   cuotas se cuenta cuando se compra, no cuando se paga la tarjeta. Es la base
 *   del dashboard, los presupuestos y la salud financiera.
 * - **Caja** — la plata que entró y salió de verdad. Vive en el cliente, en
 *   `totalsByCurrency` de `src/components/transactions/shared.ts`, porque es la
 *   lectura del extracto y de la lista de movimientos: son las filas que el
 *   usuario tiene delante y su suma tiene que cuadrar con lo que ve.
 *
 * Un `pago_tarjeta` es salida de caja pero NO es gasto devengado: el gasto ya se
 * contó en cada `gasto_tarjeta`, y sumar los dos lo contaría dos veces. Un
 * `prestamo_otorgado` es salida de caja pero tampoco es gasto: el dinero sigue
 * siendo tuyo, solo cambió de sitio. Las transferencias no son ninguna de las dos
 * cosas: son dos asientos de la misma plata. Un `ajuste` tampoco: reasigna saldo.
 */

/** Tipos que suman al gasto del período (base devengo). */
export const ACCRUAL_EXPENSE_TYPES = ["gasto", "gasto_tarjeta", "pago_deuda"] as const;

/** Tipos que suman al ingreso del período (base devengo). */
export const ACCRUAL_INCOME_TYPES = ["ingreso"] as const;

export function isAccrualExpense(type: string): boolean {
  return (ACCRUAL_EXPENSE_TYPES as readonly string[]).includes(type);
}

export function isAccrualIncome(type: string): boolean {
  return (ACCRUAL_INCOME_TYPES as readonly string[]).includes(type);
}
