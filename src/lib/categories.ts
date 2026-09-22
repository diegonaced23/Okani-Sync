type SelectableCategory = {
  _id: string;
  type: "gasto" | "ingreso" | "ambos";
  isSystem?: boolean;
};

/**
 * Categorías que el usuario puede elegir en un formulario: las del tipo pedido
 * más las de ambos tipos, sin las de sistema. Esas las asigna la app («Pago de
 * tarjeta» a los pagos): un `gasto` normal con esa categoría contaría la tarjeta
 * dos veces. La que el registro ya tiene se conserva aunque sea de sistema, para
 * que el selector no aparezca vacío al editar.
 */
export function selectableCategories<C extends SelectableCategory>(
  categories: readonly C[],
  type: string,
  currentId?: string | null
): C[] {
  return categories.filter(
    (c) =>
      (c.type === type || c.type === "ambos") &&
      (!c.isSystem || c._id === currentId)
  );
}
