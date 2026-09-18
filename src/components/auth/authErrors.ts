/**
 * Better Auth responde en inglés. Se traduce por código y no por texto, porque
 * el mensaje cambia entre versiones mientras que el código es estable — los
 * códigos de acá están verificados contra node_modules/better-auth/dist.
 */
const MESSAGES: Record<string, string> = {
  // Mismo texto para ambos a propósito: distinguirlos revelaría qué correos
  // tienen cuenta en el sistema.
  INVALID_EMAIL_OR_PASSWORD: "Correo o contraseña incorrectos.",
  USER_NOT_FOUND: "Correo o contraseña incorrectos.",
  INVALID_EMAIL: "Ese correo no tiene un formato válido.",
  TOO_MANY_REQUESTS:
    "Demasiados intentos. Espera un momento antes de volver a probar.",
  INVALID_TOKEN: "El enlace expiró o ya fue usado. Pide uno nuevo.",
  PASSWORD_TOO_SHORT: "La contraseña es demasiado corta.",
  PASSWORD_TOO_LONG: "La contraseña es demasiado larga.",
};

/**
 * Nunca devuelve el mensaje crudo de Better Auth: un código sin traducir
 * mostraría inglés en mitad de una pantalla en español (p. ej. "Invalid
 * origin", que además es un problema de configuración y no algo que el usuario
 * pueda resolver). El original va a la consola para poder depurarlo.
 */
export function authErrorMessage(
  error: { code?: string; message?: string } | undefined,
  fallback: string
) {
  if (!error) return fallback;

  const known = error.code ? MESSAGES[error.code] : undefined;
  if (known) return known;

  if (process.env.NODE_ENV !== "production") {
    console.warn("[auth] error sin traducir:", error.code, error.message);
  }
  return fallback;
}
