/**
 * Fecha en que se carga cada cuota de una compra a la tarjeta.
 *
 * `dueDate` de una cuota significa «cuándo entra al extracto», no la fecha límite
 * de pago: es lo que usa `computeStatement` para repartir el saldo y lo que usa
 * el cron de facturación para saber cuándo registrar la cuota y su interés.
 *
 * - De contado (1 cuota): el día de la compra. Es un gasto normal desde ese día.
 * - A cuotas: la primera en el corte del ciclo en el que cae la compra, y cada
 *   una de las siguientes en el corte del mes siguiente. Así las cuotas quedan
 *   atadas al ciclo de la tarjeta en vez de a la fecha que se escribiera.
 *
 * El corte es a las 23:59:59.999 de su día, igual que en `getBillingCycleDates`,
 * para que una compra hecha el mismo día del corte entre en ese corte. Un corte
 * el 31 cae el último día de los meses cortos.
 */
export function cuotaChargeDates(purchaseDate: number, cutoffDay: number, installments: number): number[] {
  if (installments <= 1) return [purchaseDate];

  const cutoffOf = (y: number, m: number) =>
    new Date(y, m, Math.min(cutoffDay, new Date(y, m + 1, 0).getDate()), 23, 59, 59, 999).getTime();

  const p = new Date(purchaseDate);
  // Mes (absoluto) del primer corte que cubre la compra
  let first = p.getFullYear() * 12 + p.getMonth();
  if (purchaseDate > cutoffOf(p.getFullYear(), p.getMonth())) first += 1;

  return Array.from({ length: installments }, (_, k) => {
    const abs = first + k;
    return cutoffOf(Math.floor(abs / 12), abs % 12);
  });
}

/**
 * Ajusta el cronograma para que el capital de las cuotas sume exactamente la
 * compra. `calculateInstallment` redondea cada cuota por separado (100 en 3 da
 * 33 + 33 + 33 = 99), y como la deuda sube por `totalAmount` pero cada cuota
 * debe su `principalAmount`, esos centavos quedarían sueltos como «sin detalle».
 * La última cuota absorbe la diferencia, como hacen los bancos.
 */
export function balanceScheduleToPrincipal<
  T extends { amount: number; principalAmount: number; interestAmount: number; remainingPrincipal: number },
>(schedule: T[], totalAmount: number): T[] {
  const diff = totalAmount - schedule.reduce((s, i) => s + i.principalAmount, 0);
  if (diff === 0 || schedule.length === 0) return schedule;
  const last = schedule[schedule.length - 1];
  return [
    ...schedule.slice(0, -1),
    { ...last, principalAmount: last.principalAmount + diff, amount: last.amount + diff, remainingPrincipal: 0 },
  ];
}
