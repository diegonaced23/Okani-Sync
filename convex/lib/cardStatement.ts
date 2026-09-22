/**
 * El saldo de una tarjeta repartido como en Money Manager: lo que hay que pagar
 * del extracto cerrado, lo que va del ciclo abierto y lo que queda en cuotas.
 *
 * Cada cuota aporta lo que debe hoy (`remaining`, de `installmentRemaining`) al
 * ciclo en el que cae su `dueDate`, la fecha en que se carga a la tarjeta (no la
 * fecha límite de pago; ver `cardSchedule.ts`):
 * - `porPagar`: cargada hasta el corte anterior → está en el extracto cerrado.
 *   Es el pago mínimo.
 * - `enCurso`: entre el corte anterior y el próximo → entra en el próximo extracto.
 * - `cuotasPorFacturar`: después del próximo corte.
 *
 * `currentBalance` es la fuente de verdad de la deuda. Lo que las cuotas no
 * explican se reparte así:
 * - Si sobra deuda (la deuda inicial al registrar la tarjeta, o cargos antiguos
 *   sin cuota), va a `sinDetalle`. No se suma al pago mínimo: la app no sabe qué
 *   parte de esa deuda está facturada, y afirmarlo sería inventar.
 * - Si falta (no debería: los abonos parciales ya vienen en `remaining`; puede
 *   pasar con datos del modelo anterior), se descuenta de lo más antiguo primero,
 *   igual que reparte los pagos `allocatePayments`.
 *
 * Las cuatro cifras suman siempre `deudaTotal`, que es `currentBalance`.
 */
export function computeStatement(args: {
  installments: readonly { remaining: number; dueDate: number }[];
  currentBalance: number;
  prevCutoffTs: number;
  nextCutoffTs: number;
}): {
  porPagar: number;
  enCurso: number;
  cuotasPorFacturar: number;
  sinDetalle: number;
  deudaTotal: number;
} {
  const { installments, currentBalance, prevCutoffTs, nextCutoffTs } = args;
  const buckets = [0, 0, 0]; // porPagar, enCurso, cuotasPorFacturar
  for (const inst of installments) {
    if (inst.remaining <= 0) continue;
    const i = inst.dueDate <= prevCutoffTs ? 0 : inst.dueDate <= nextCutoffTs ? 1 : 2;
    buckets[i] += inst.remaining;
  }

  const residual = currentBalance - (buckets[0] + buckets[1] + buckets[2]);
  let sinDetalle = 0;
  if (residual > 0) {
    sinDetalle = residual;
  } else {
    let credit = -residual;
    for (let i = 0; i < buckets.length && credit > 0; i++) {
      const applied = Math.min(buckets[i], credit);
      buckets[i] -= applied;
      credit -= applied;
    }
  }

  return {
    porPagar: buckets[0],
    enCurso: buckets[1],
    cuotasPorFacturar: buckets[2],
    sinDetalle,
    deudaTotal: currentBalance,
  };
}
