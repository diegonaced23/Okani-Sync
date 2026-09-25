/**
 * Forma canónica de un correo para buscarlo y guardarlo.
 *
 * Vive aquí, pura y sin Convex, porque es la regla de la que depende que una
 * invitación se encuentre: si la escritura y la lectura la aplicaran distinto,
 * la invitación quedaría pendiente para siempre y su titular no podría entrar
 * nunca. Este repositorio no puede testear funciones de Convex, así que la
 * regla se extrae para poder probarla.
 */
export function normalizeEmail(raw: string): string {
  return raw.toLowerCase().trim();
}

/**
 * Correos que colapsan al mismo valor normalizado (`Ana@x.com` y `ana@x.com`).
 *
 * La usa migrations:normalizeUserEmails para negarse a correr si las hay:
 * normalizar esas filas dejaría dos usuarios con el mismo correo, y los
 * `unique()` sobre `by_email` del login empezarían a lanzar para los dos.
 * Qué fila sobrevive es una decisión humana, así que acá solo se reportan.
 */
export function findEmailCollisions(
  emails: string[]
): Array<{ normalized: string; originals: string[] }> {
  const groups = new Map<string, string[]>();
  for (const email of emails) {
    const key = normalizeEmail(email);
    const group = groups.get(key);
    if (group) group.push(email);
    else groups.set(key, [email]);
  }
  return [...groups]
    .filter(([, originals]) => originals.length > 1)
    .map(([normalized, originals]) => ({ normalized, originals }));
}
