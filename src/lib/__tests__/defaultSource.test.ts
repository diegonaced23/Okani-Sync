import { describe, expect, it } from "vitest";
import { resolveDefaultSource } from "../defaultSource";

const base = { accountIds: ["a1", "a2"], cardIds: ["c1"] };

describe("resolveDefaultSource", () => {
  it("sin favorita y con varias opciones, obliga a escoger", () => {
    expect(resolveDefaultSource({ ...base, type: "gasto" })).toBe("");
  });

  it("usa la cuenta favorita en gastos e ingresos", () => {
    const favorite = { kind: "account" as const, id: "a2" };
    expect(resolveDefaultSource({ ...base, type: "gasto", favorite })).toBe("account:a2");
    expect(resolveDefaultSource({ ...base, type: "ingreso", favorite })).toBe("account:a2");
  });

  it("una tarjeta favorita vale para gastos pero no para ingresos", () => {
    const favorite = { kind: "card" as const, id: "c1" };
    expect(resolveDefaultSource({ ...base, type: "gasto", favorite })).toBe("card:c1");
    expect(resolveDefaultSource({ ...base, type: "ingreso", favorite })).toBe("");
  });

  it("ignora una favorita archivada o borrada", () => {
    expect(resolveDefaultSource({ ...base, type: "gasto", favorite: { kind: "account", id: "vieja" } })).toBe("");
  });

  it("lo que pide quien abre el formulario manda sobre la favorita", () => {
    const favorite = { kind: "account" as const, id: "a1" };
    expect(resolveDefaultSource({ ...base, type: "gasto", favorite, initial: "card:c1" })).toBe("card:c1");
  });

  it("una tarjeta pedida para un ingreso se descarta y cae a la favorita", () => {
    const favorite = { kind: "account" as const, id: "a1" };
    expect(resolveDefaultSource({ ...base, type: "ingreso", favorite, initial: "card:c1" })).toBe("account:a1");
  });

  it("con una sola opción posible la elige sola", () => {
    expect(resolveDefaultSource({ type: "gasto", accountIds: [], cardIds: ["c1"] })).toBe("card:c1");
    // En un ingreso las tarjetas no cuentan: la única cuenta es la única opción
    expect(resolveDefaultSource({ type: "ingreso", accountIds: ["a1"], cardIds: ["c1"] })).toBe("account:a1");
  });
});
