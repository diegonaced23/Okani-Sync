/**
 * Movimientos de presupuesto al cambiar la categoría de una compra con tarjeta.
 *
 * Cada cuota reparte su monto al crearse la compra (`createPurchase`): el capital
 * a la categoría de la compra y el interés a «Gastos financieros», tenga o no
 * categoría la compra. Cambiar la categoría solo mueve el capital; el interés ya
 * está donde debe y no se toca. Antes se restaba el interés y solo se volvía a
 * sumar si había categoría nueva, así que quitar la categoría lo hacía
 * desaparecer del presupuesto de intereses.
 *
 * Sin categoría de intereses (usuario sin la de sistema), la cuota entera va con
 * la categoría de la compra, igual que en `createPurchase`.
 */
export function categoryRotationDeltas<CatId extends string>(args: {
  installments: readonly {
    month: string;
    amount: number;
    principalAmount?: number;
  }[];
  oldCategoryId: CatId | undefined;
  newCategoryId: CatId | undefined;
  interestsCategoryId: CatId | undefined;
}): { categoryId: CatId; month: string; delta: number }[] {
  const { installments, oldCategoryId, newCategoryId, interestsCategoryId } = args;
  const deltas: { categoryId: CatId; month: string; delta: number }[] = [];
  for (const inst of installments) {
    const principal = interestsCategoryId ? (inst.principalAmount ?? inst.amount) : inst.amount;
    if (oldCategoryId) deltas.push({ categoryId: oldCategoryId, month: inst.month, delta: -principal });
    if (newCategoryId) deltas.push({ categoryId: newCategoryId, month: inst.month, delta: principal });
  }
  return deltas;
}
