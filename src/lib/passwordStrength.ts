/**
 * Mínimo de Better Auth (`minPasswordLength`, 8 por defecto). Es la única regla
 * que bloquea el envío: el backend no exige nada más, y rechazar en el cliente
 * lo que el servidor aceptaría solo añade fricción sin añadir seguridad real.
 * El resto de reglas orientan al usuario hacia una contraseña más fuerte.
 */
export const PASSWORD_MIN_LENGTH = 8;

export type PasswordRuleId = "length" | "case" | "digit" | "symbol";

export interface PasswordRule {
  id: PasswordRuleId;
  label: string;
  met: boolean;
}

export interface PasswordStrength {
  rules: PasswordRule[];
  /** 0–4: una unidad por regla cumplida, con tope 1 si no llega al mínimo. */
  score: number;
  /** Solo refleja la longitud mínima — ver PASSWORD_MIN_LENGTH. */
  valid: boolean;
}

const RULES: { id: PasswordRuleId; label: string; test: (p: string) => boolean }[] = [
  {
    id: "length",
    label: `Al menos ${PASSWORD_MIN_LENGTH} caracteres`,
    test: (p) => p.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: "case",
    label: "Mayúsculas y minúsculas",
    test: (p) => /[a-z]/.test(p) && /[A-Z]/.test(p),
  },
  { id: "digit", label: "Un número", test: (p) => /\d/.test(p) },
  // Todo lo que no sea ASCII alfanumérico cuenta: una ñ, una tilde o un espacio
  // amplían el alfabeto igual que un signo de puntuación.
  { id: "symbol", label: "Un símbolo", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export function passwordStrength(password: string): PasswordStrength {
  const rules = RULES.map(({ id, label, test }) => ({ id, label, met: test(password) }));
  const valid = rules[0].met;
  const met = rules.filter((r) => r.met).length;
  // Una contraseña corta con mayúsculas, número y símbolo sigue siendo corta:
  // sin el tope, "Ab1!" aparecería como fuerte y el botón seguiría deshabilitado.
  const score = valid ? met : Math.min(met, 1);
  return { rules, score, valid };
}
