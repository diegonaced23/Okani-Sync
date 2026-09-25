// Imports RELATIVOS y no con el alias `@/`: este archivo lo importa
// convex/registrationRequests.ts, y el empaquetador de Convex no resuelve el
// alias. Los dos destinos son hermanos en src/lib/.
import { normalizeEmail } from "./email";
import { REGISTRATION_FIELD_LIMITS, REGISTRATION_SOURCES } from "./constants";

export type RegistrationSource = (typeof REGISTRATION_SOURCES)[number]["value"];

export type RegistrationRequestInput = {
  email: string;
  name: string;
  city: string;
  source: string;
  referredBy?: string;
  note: string;
};

export type RegistrationRequestFields = {
  email: string;
  name: string;
  city: string;
  source: RegistrationSource;
  referredBy?: string;
  note: string;
};

export type RegistrationValidation =
  | { ok: true; value: RegistrationRequestFields }
  | { ok: false; error: string };

/** Una parte local y un dominio con al menos un punto, sin espacios, comas, punto y coma ni una segunda arroba. */
const EMAIL_SHAPE = /^[^\s@,;]+@[^\s@,;.]+(\.[^\s@,;.]+)+$/;

function esSourceValido(value: string): value is RegistrationSource {
  return REGISTRATION_SOURCES.some((s) => s.value === value);
}

/**
 * Valida y normaliza los campos del formulario público.
 *
 * La usan el formulario del navegador y la mutation de Convex. Es a propósito:
 * si cada uno aplicara su propio criterio, alguien vería "enviado" y el
 * servidor lo rechazaría, o al revés.
 *
 * Todo se recorta ANTES de medirlo, para que un campo de espacios no cuente
 * como lleno ni un texto con espacios de sobra se pase del tope por nada.
 */
export function validateRegistrationRequest(
  input: RegistrationRequestInput
): RegistrationValidation {
  const email = normalizeEmail(input.email ?? "");
  const name = (input.name ?? "").trim();
  const city = (input.city ?? "").trim();
  const note = (input.note ?? "").trim();
  const referredByRaw = (input.referredBy ?? "").trim();
  const referredBy = referredByRaw === "" ? undefined : referredByRaw;

  if (email === "") return { ok: false, error: "Escribe tu correo." };
  // La posesión real del correo la prueba el magic link, así que esto no
  // pretende ser RFC 5322. Pero tampoco puede ser laxo del todo: el valor va
  // tal cual al `to:` de Resend, y algo como "a@x.com,b@y.com" convertiría un
  // acuse en un envío a varias personas que no pidieron nada. Por eso: una
  // sola arroba, sin espacios ni separadores, y un dominio con punto.
  if (!EMAIL_SHAPE.test(email)) {
    return { ok: false, error: "Ese correo no parece válido." };
  }
  if (email.length > REGISTRATION_FIELD_LIMITS.email) {
    return { ok: false, error: "Ese correo es demasiado largo." };
  }

  if (name === "") return { ok: false, error: "Escribe tu nombre." };
  if (name.length > REGISTRATION_FIELD_LIMITS.name) {
    return { ok: false, error: `El nombre no puede pasar de ${REGISTRATION_FIELD_LIMITS.name} caracteres.` };
  }

  if (city === "") return { ok: false, error: "Escribe tu ciudad." };
  if (city.length > REGISTRATION_FIELD_LIMITS.city) {
    return { ok: false, error: `La ciudad no puede pasar de ${REGISTRATION_FIELD_LIMITS.city} caracteres.` };
  }

  if (!esSourceValido(input.source ?? "")) {
    return { ok: false, error: "Cuéntanos cómo conociste la app." };
  }

  if (referredBy !== undefined && referredBy.length > REGISTRATION_FIELD_LIMITS.referredBy) {
    return { ok: false, error: `Ese nombre no puede pasar de ${REGISTRATION_FIELD_LIMITS.referredBy} caracteres.` };
  }

  if (note === "") return { ok: false, error: "Cuéntanos por qué quieres usar la app." };
  if (note.length > REGISTRATION_FIELD_LIMITS.note) {
    return { ok: false, error: `La nota no puede pasar de ${REGISTRATION_FIELD_LIMITS.note} caracteres.` };
  }

  return {
    ok: true,
    value: { email, name, city, source: input.source as RegistrationSource, referredBy, note },
  };
}

/** Una solicitud solo se puede aprobar o rechazar mientras siga pendiente. */
export function canReview(status: "pending" | "approved" | "rejected"): boolean {
  return status === "pending";
}
