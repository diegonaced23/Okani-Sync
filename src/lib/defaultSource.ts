// Qué cuenta o tarjeta llega seleccionada al abrir el formulario de un
// movimiento. El valor va codificado como en AccountCardSelect:
// "account:ID" | "card:ID", o "" si no hay una elección razonable y el usuario
// tiene que escoger (el formulario no permite guardar sin origen).

export type FavoriteSource = { kind: "account"; id: string } | { kind: "card"; id: string };

interface DefaultSourceInput {
  type: "ingreso" | "gasto";
  /** Fuente pedida por quien abrió el formulario (p. ej. «Registrar pago» de una tarjeta) */
  initial?: string;
  favorite?: FavoriteSource | null;
  accountIds: string[];
  cardIds: string[];
}

export function resolveDefaultSource({ type, initial, favorite, accountIds, cardIds }: DefaultSourceInput): string {
  // Una tarjeta nunca recibe un ingreso: en ese caso solo cuentan las cuentas
  const usableCards = type === "gasto" ? cardIds : [];
  const isUsable = (v: string) => {
    const [kind, id] = v.split(":");
    return kind === "account" ? accountIds.includes(id) : kind === "card" && usableCards.includes(id);
  };

  // 1. Lo que pidió quien abrió el formulario manda sobre la preferencia
  if (initial && isUsable(initial)) return initial;

  // 2. La favorita, si sigue activa y sirve para este tipo de movimiento
  if (favorite) {
    const v = `${favorite.kind}:${favorite.id}`;
    if (isUsable(v)) return v;
  }

  // 3. Con una sola opción posible no hay nada que preguntar
  if (accountIds.length + usableCards.length === 1) {
    return accountIds.length === 1 ? `account:${accountIds[0]}` : `card:${usableCards[0]}`;
  }

  return "";
}
