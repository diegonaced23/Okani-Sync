import { describe, it, expect } from "vitest";
import {
  validateRegistrationRequest,
  canReview,
} from "@/lib/registrationRequest";
import { REGISTRATION_FIELD_LIMITS } from "@/lib/constants";

const valido = {
  email: "  Ana@Correo.COM ",
  name: "  Ana Pérez ",
  city: " Medellín ",
  source: "amigo",
  referredBy: "  Juan ",
  note: "  Quiero ordenar mis gastos del mes. ",
};

describe("validateRegistrationRequest", () => {
  it("normaliza el correo y recorta el resto", () => {
    const r = validateRegistrationRequest(valido);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.email).toBe("ana@correo.com");
    expect(r.value.name).toBe("Ana Pérez");
    expect(r.value.city).toBe("Medellín");
    expect(r.value.referredBy).toBe("Juan");
    expect(r.value.note).toBe("Quiero ordenar mis gastos del mes.");
  });

  it("deja referredBy en undefined cuando viene vacío o solo con espacios", () => {
    const r = validateRegistrationRequest({ ...valido, referredBy: "   " });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.referredBy).toBeUndefined();
  });

  it("acepta que referredBy no venga", () => {
    // Se construye sin el campo en vez de desestructurarlo fuera: así el test
    // no depende de cómo esté configurada la regla de variables sin usar.
    const r = validateRegistrationRequest({
      email: valido.email,
      name: valido.name,
      city: valido.city,
      source: valido.source,
      note: valido.note,
    });
    expect(r.ok).toBe(true);
  });

  it.each(["name", "city", "note"] as const)(
    "rechaza %s vacío",
    (campo) => {
      const r = validateRegistrationRequest({ ...valido, [campo]: "   " });
      expect(r.ok).toBe(false);
    }
  );

  it("rechaza un correo sin arroba", () => {
    const r = validateRegistrationRequest({ ...valido, email: "ana" });
    expect(r.ok).toBe(false);
  });

  it.each([
    ["varios destinatarios separados por coma", "ana@x.com,otro@y.com"],
    ["espacios en medio", "ana perez@x.com"],
    ["dos arrobas", "ana@@x.com"],
    ["dominio sin punto", "ana@localhost"],
    ["punto final en el dominio", "ana@x."],
    ["punto y coma", "ana@x.com;otro@y.com"],
  ])("rechaza un correo con %s", (_caso, email) => {
    const r = validateRegistrationRequest({ ...valido, email });
    expect(r.ok).toBe(false);
  });

  it("rechaza un correo vacío", () => {
    const r = validateRegistrationRequest({ ...valido, email: "  " });
    expect(r.ok).toBe(false);
  });

  it("rechaza un source que no está en la lista", () => {
    const r = validateRegistrationRequest({ ...valido, source: "telepatía" });
    expect(r.ok).toBe(false);
  });

  it("rechaza una nota por encima del tope", () => {
    const r = validateRegistrationRequest({
      ...valido,
      note: "x".repeat(REGISTRATION_FIELD_LIMITS.note + 1),
    });
    expect(r.ok).toBe(false);
  });

  it("acepta una nota exactamente en el tope", () => {
    const r = validateRegistrationRequest({
      ...valido,
      note: "x".repeat(REGISTRATION_FIELD_LIMITS.note),
    });
    expect(r.ok).toBe(true);
  });

  it("mide el tope DESPUÉS de recortar", () => {
    const r = validateRegistrationRequest({
      ...valido,
      name: "  " + "x".repeat(REGISTRATION_FIELD_LIMITS.name) + "  ",
    });
    expect(r.ok).toBe(true);
  });

  it("rechaza un nombre por encima del tope", () => {
    const r = validateRegistrationRequest({
      ...valido,
      name: "x".repeat(REGISTRATION_FIELD_LIMITS.name + 1),
    });
    expect(r.ok).toBe(false);
  });

  it("devuelve un error legible, no un código", () => {
    const r = validateRegistrationRequest({ ...valido, name: "" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.length).toBeGreaterThan(10);
  });
});

describe("canReview", () => {
  it("solo se puede revisar una solicitud pendiente", () => {
    expect(canReview("pending")).toBe(true);
    expect(canReview("approved")).toBe(false);
    expect(canReview("rejected")).toBe(false);
  });
});
