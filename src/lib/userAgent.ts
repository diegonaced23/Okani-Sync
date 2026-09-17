/**
 * Parseo mínimo del user agent de una sesión de Better Auth para mostrar
 * "Chrome · macOS" en la lista de sesiones del perfil.
 *
 * El orden de las comprobaciones importa: los navegadores mienten en su UA.
 * Edge se anuncia como Chrome (`Edg/...` además de `Chrome/...`) y Chrome se
 * anuncia como Safari (`Safari/537.36`), así que hay que ir de lo más
 * específico a lo más genérico.
 *
 * No se añade una dependencia de parseo: aquí solo se necesita una etiqueta
 * legible, no una identificación exacta.
 */
export type ParsedUserAgent = {
  browser: string;
  os: string;
  isMobile: boolean;
};

const DESCONOCIDO = "Desconocido";

export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  const value = ua?.trim() ?? "";
  if (!value) return { browser: DESCONOCIDO, os: DESCONOCIDO, isMobile: false };

  const browser =
    /\bEdg[A-Z]?\//i.test(value) ? "Edge"
    : /\bOPR\/|\bOpera\b/i.test(value) ? "Opera"
    : /\bFirefox\/|\bFxiOS\//i.test(value) ? "Firefox"
    : /\bChrome\/|\bCriOS\//i.test(value) ? "Chrome"
    : /\bSafari\//i.test(value) ? "Safari"
    : DESCONOCIDO;

  const os =
    /\biPhone\b|\biPad\b|\biPod\b|\biOS\b/i.test(value) ? "iOS"
    : /\bAndroid\b/i.test(value) ? "Android"
    : /\bWindows\b/i.test(value) ? "Windows"
    : /\bMac OS X\b|\bMacintosh\b/i.test(value) ? "macOS"
    : /\bLinux\b|\bX11\b/i.test(value) ? "Linux"
    : DESCONOCIDO;

  const isMobile = os === "iOS" || os === "Android" || /\bMobile\b/i.test(value);

  return { browser, os, isMobile };
}

/** Etiqueta lista para mostrar: "Chrome · macOS", o "Dispositivo desconocido". */
export function formatDevice(parsed: ParsedUserAgent): string {
  if (parsed.browser === DESCONOCIDO && parsed.os === DESCONOCIDO) {
    return "Dispositivo desconocido";
  }
  return `${parsed.browser} · ${parsed.os}`;
}
