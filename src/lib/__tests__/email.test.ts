import { describe, it, expect } from "vitest";
import { findEmailCollisions, normalizeEmail } from "../email";

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

describe("findEmailCollisions", () => {
  it("no encuentra nada cuando cada correo normalizado es único", () => {
    expect(findEmailCollisions(["ana@x.com", "Luis@x.com", "pepe@y.com"])).toEqual([]);
  });

  it("agrupa los correos que colapsan al mismo valor normalizado", () => {
    expect(
      findEmailCollisions(["Ana@x.com", "luis@x.com", " ana@X.com", "ana@x.com"])
    ).toEqual([
      { normalized: "ana@x.com", originals: ["Ana@x.com", " ana@X.com", "ana@x.com"] },
    ]);
  });

  it("cuenta como colisión dos filas con el mismo correo exacto", () => {
    expect(findEmailCollisions(["ana@x.com", "ana@x.com"])).toEqual([
      { normalized: "ana@x.com", originals: ["ana@x.com", "ana@x.com"] },
    ]);
  });
});
