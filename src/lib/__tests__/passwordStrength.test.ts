import { describe, it, expect } from "vitest";
import { PASSWORD_MIN_LENGTH, passwordStrength } from "../passwordStrength";

describe("passwordStrength", () => {
  it("una contraseña vacía tiene score 0 y no es válida", () => {
    const r = passwordStrength("");
    expect(r.score).toBe(0);
    expect(r.valid).toBe(false);
    expect(r.rules.every((rule) => !rule.met)).toBe(true);
  });

  it("solo la longitud mínima hace válida la contraseña", () => {
    expect(passwordStrength("a".repeat(PASSWORD_MIN_LENGTH - 1)).valid).toBe(false);
    expect(passwordStrength("a".repeat(PASSWORD_MIN_LENGTH)).valid).toBe(true);
  });

  it("sin la longitud mínima el score no pasa de 1 aunque cumpla el resto", () => {
    const r = passwordStrength("Ab1!");
    expect(r.valid).toBe(false);
    expect(r.score).toBe(1);
  });

  it("suma un punto por cada regla cumplida", () => {
    expect(passwordStrength("abcdefgh").score).toBe(1);
    expect(passwordStrength("abcdEfgh").score).toBe(2);
    expect(passwordStrength("abcdEfg1").score).toBe(3);
    expect(passwordStrength("abcdEf1!").score).toBe(4);
  });

  it("marca cada regla por separado", () => {
    const met = Object.fromEntries(
      passwordStrength("abcdefg1").rules.map((r) => [r.id, r.met])
    );
    expect(met).toEqual({ length: true, case: false, digit: true, symbol: false });
  });

  it("cuenta letras acentuadas y espacios como símbolos", () => {
    const symbol = (p: string) =>
      passwordStrength(p).rules.find((r) => r.id === "symbol")?.met;
    expect(symbol("contraseña")).toBe(true);
    expect(symbol("dos palabras")).toBe(true);
    expect(symbol("abcdefgh")).toBe(false);
  });
});
