/**
 * Pasa el correo escrito en /login a /forgot-password sin ponerlo en la URL:
 * un `?email=` quedaría en el historial del navegador, en los logs del hosting
 * y en las URLs que registra Sentry. sessionStorage vive solo en esta pestaña,
 * y `takeHandoffEmail` lo borra al leerlo para que no quede guardado.
 *
 * Todo va en try/catch: con el storage bloqueado (navegación privada, cookies
 * de sitio desactivadas) el campo simplemente aparece vacío.
 */
const KEY = "okany-auth-email";

export function stashHandoffEmail(email: string) {
  try {
    if (email) sessionStorage.setItem(KEY, email);
    else sessionStorage.removeItem(KEY);
  } catch {
    // Sin storage no hay traspaso: el usuario vuelve a escribir el correo.
  }
}

export function takeHandoffEmail(): string {
  try {
    const email = sessionStorage.getItem(KEY) ?? "";
    sessionStorage.removeItem(KEY);
    return email;
  } catch {
    return "";
  }
}
