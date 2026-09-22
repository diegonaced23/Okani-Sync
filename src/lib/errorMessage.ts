// Texto de error apto para un aviso. Las mutations lanzan `new Error("…")` con
// mensajes ya pensados para la persona, pero el cliente de Convex los entrega
// envueltos: "[CONVEX M(loans:create)] [Request ID: …] Server Error\nUncaught
// Error: El monto debe ser mayor que cero\n    at handler (…)". En producción
// Convex además borra el mensaje y deja solo "Server Error".

/** Errores del validador de argumentos u otros internos: no se muestran tal cual */
const TECHNICAL = /^(ArgumentValidationError|ReturnsValidationError|TypeError|ReferenceError)\b/;

/**
 * Devuelve el mensaje legible del error, o `fallback` si no hay uno que valga
 * la pena mostrar (error de red, validador, o el "Server Error" de producción).
 */
export function errorMessage(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!raw) return fallback;

  // Lo que la mutation lanzó va tras "Uncaught Error:" y termina en el salto
  // de línea que precede a la traza
  const uncaught = raw.match(/Uncaught (?:Convex)?Error:\s*(.+)/);
  if (uncaught) return clean(uncaught[1]) || fallback;

  // Envuelto por Convex pero sin mensaje propio
  if (raw.startsWith("[CONVEX") || /Server Error/.test(raw)) return fallback;

  const firstLine = clean(raw.split("\n")[0]);
  if (!firstLine || TECHNICAL.test(firstLine)) return fallback;
  return firstLine;
}

function clean(s: string): string {
  return s.trim().replace(/\s+at\s.*$/, "");
}
