/**
 * Cuánto debe cada cuota y cómo se reparten entre ellas los pagos a la tarjeta.
 *
 * Lo usan el backend (`recomputeInstallmentsPaid`, `getCardDetailData`) y la hoja
 * de pago, que anticipa qué cuotas quedan saldadas antes de confirmar: si cada uno
 * tuviera su versión, la vista previa podría contradecir lo que se guarda.
 *
 * Modelo de intereses (fase 3 del rediseño): la deuda de la tarjeta sube por el
 * CAPITAL al comprar, y el interés de cada cuota se suma cuando esa cuota se
 * factura (`billedAt`). Las cuotas del modelo anterior —sin `interestBilling`,
 * todavía sin migrar— ya tenían la cuota entera, interés incluido, en la deuda.
 */

export type InstallmentBalanceFields = {
  amount: number;
  principalAmount?: number;
  interestAmount?: number;
  /** "at_cutoff": el interés se cobra al facturar. Sin él, modelo anterior. */
  interestBilling?: "at_cutoff";
  billedAt?: number;
};

/** Lo que la cuota ha cargado a la deuda hasta hoy, pagado o no. */
export function installmentDue(inst: InstallmentBalanceFields): number {
  if (inst.interestBilling !== "at_cutoff") return inst.amount;
  const principal = inst.principalAmount ?? inst.amount;
  const interest = inst.principalAmount === undefined ? 0 : (inst.interestAmount ?? 0);
  return principal + (inst.billedAt !== undefined ? interest : 0);
}

/** Lo que la cuota debe todavía. Sin `paidAmount` (cuota antigua), usa `paid`. */
export function installmentRemaining(
  inst: InstallmentBalanceFields & { paidAmount?: number; paid?: boolean }
): number {
  const due = installmentDue(inst);
  if (inst.paidAmount === undefined) return inst.paid ? 0 : due;
  return Math.max(0, due - inst.paidAmount);
}

/**
 * Cuánto se ha pagado a las cuotas: lo que cargaron menos lo que aún se debe.
 *
 * La deuda que no viene de cuotas (la que traía la tarjeta al registrarla) queda
 * dentro de `currentBalance` y hace que lo pagado a cuotas salga menor: es decir,
 * los pagos la cubren primero, porque es la más antigua.
 */
export function totalPaidFor(items: readonly { due: number }[], currentBalance: number): number {
  const charged = items.reduce((s, i) => s + i.due, 0);
  return Math.max(0, charged - currentBalance);
}

/**
 * Reparte lo pagado de la cuota más antigua a la más nueva (por `dueDate`). Un
 * abono que no alcanza una cuota entera queda en ella como pago parcial.
 * Devuelve lo asignado a cada cuota, en el mismo orden de entrada.
 */
export function allocatePayments(items: readonly { due: number; dueDate: number }[], totalPaid: number): number[] {
  const order = items.map((_, i) => i).sort((a, b) => items[a].dueDate - items[b].dueDate);
  const paid = new Array<number>(items.length).fill(0);
  let left = totalPaid;
  for (const i of order) {
    const applied = Math.min(items[i].due, left);
    paid[i] = applied;
    left -= applied;
    if (left <= 0) break;
  }
  return paid;
}

/**
 * Anticipa qué cuotas quedan saldadas si se paga `paymentAmount`, con el mismo
 * reparto que aplicará `recomputeInstallmentsPaid` al guardar. No escribe nada.
 *
 * Recibe TODAS las cuotas de la tarjeta, incluidas las ya pagadas: lo pagado se
 * deduce de lo cargado, y sin las pagadas la cuenta saldría corrida.
 */
export function simulateCardPayment<
  T extends InstallmentBalanceFields & { dueDate: number; paidAmount?: number; paid?: boolean },
>(
  installments: T[],
  currentBalance: number,
  paymentAmount: number,
): { newlyPaid: T[]; stillUnpaid: T[]; newBalance: number } {
  const newBalance = Math.max(0, currentBalance - Math.min(paymentAmount, currentBalance));
  const items = installments.map((inst) => ({ due: installmentDue(inst), dueDate: inst.dueDate }));
  const after = allocatePayments(items, totalPaidFor(items, newBalance));

  const sorted = installments
    .map((inst, i) => ({ inst, before: installmentRemaining(inst), after: items[i].due - after[i] }))
    .filter((x) => x.before > 0)
    .sort((a, b) => a.inst.dueDate - b.inst.dueDate);

  return {
    newlyPaid: sorted.filter((x) => x.after <= 0).map((x) => x.inst),
    stillUnpaid: sorted.filter((x) => x.after > 0).map((x) => x.inst),
    newBalance,
  };
}

/**
 * Si la cuota todavía no cuenta como gasto en `month` («YYYY-MM»): lo que el
 * dashboard muestra aparte como «compras con tarjeta por facturar».
 * - Modelo nuevo: el gasto se registra al facturarse, así que no cuenta mientras
 *   no tenga `billedAt`.
 * - Modelo anterior: el gasto ya existe, con la fecha de la cuota; cuenta en el
 *   mes de esa fecha, así que no cuenta aún si cae en un mes posterior.
 */
export function isNotYetExpensed(
  inst: { interestBilling?: "at_cutoff"; billedAt?: number; dueDate: number },
  month: string
): boolean {
  if (inst.interestBilling === "at_cutoff") return inst.billedAt === undefined;
  const d = new Date(inst.dueDate);
  const dueMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return dueMonth > month;
}
