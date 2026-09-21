import { describe, it, expect } from "vitest";
import { normalizeEmail } from "../email";

describe("normalizeEmail", () => {
  it("deja intacto un correo ya normalizado", () => {
    expect(normalizeEmail("persona@ejemplo.com")).toBe("persona@ejemplo.com");
  });

  it("convierte mayúsculas mezcladas a minúsculas", () => {
    expect(normalizeEmail("Persona@Ejemplo.COM")).toBe("persona@ejemplo.com");
  });

  it("recorta espacios por delante", () => {
    expect(normalizeEmail("   persona@ejemplo.com")).toBe("persona@ejemplo.com");
  });

  it("recorta espacios por detrás", () => {
    expect(normalizeEmail("persona@ejemplo.com   ")).toBe("persona@ejemplo.com");
  });

  it("combina mayúsculas y espacios por ambos lados", () => {
    expect(normalizeEmail("  Persona@Ejemplo.COM  ")).toBe("persona@ejemplo.com");
  });

  it("devuelve cadena vacía para entrada vacía", () => {
    expect(normalizeEmail("")).toBe("");
  });

  it("es idempotente: normalizar dos veces da el mismo resultado que una", () => {
    const casos = ["Persona@Ejemplo.COM", "  a@b.com  ", "", "ya@normal.com"];
    for (const caso of casos) {
      const once = normalizeEmail(caso);
      expect(normalizeEmail(once)).toBe(once);
    }
  });
});
