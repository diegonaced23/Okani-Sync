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
