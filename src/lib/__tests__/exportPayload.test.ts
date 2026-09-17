import { describe, it, expect } from "vitest";
import { buildTableExport } from "../exportPayload";

describe("buildTableExport", () => {
  const filas = [
    { _id: "a", amount: 150050, description: "Mercado" },
    { _id: "b", amount: 2500, description: "Café" },
  ];

  it("añade el valor humano junto al entero en centavos", () => {
    const resultado = buildTableExport(filas, 10, ["amount"]);
    expect(resultado.rows[0]).toEqual({
      _id: "a",
      amount: 150050,
      amountValue: 1500.5,
      description: "Mercado",
    });
  });

  it("conserva el entero original sin tocarlo", () => {
    const resultado = buildTableExport(filas, 10, ["amount"]);
    expect((resultado.rows[1] as { amount: number }).amount).toBe(2500);
  });

  it("ignora los campos de dinero que no están en la fila", () => {
    const resultado = buildTableExport([{ _id: "x" }], 10, ["amount", "balance"]);
    expect(resultado.rows[0]).toEqual({ _id: "x" });
  });

  it("no marca truncado cuando hay menos filas que el límite", () => {
    const resultado = buildTableExport(filas, 10, []);
    expect(resultado).toMatchObject({ count: 2, truncated: false });
  });

  it("marca truncado cuando se alcanzó el límite exacto", () => {
    const resultado = buildTableExport(filas, 2, []);
    expect(resultado).toMatchObject({ count: 2, truncated: true });
  });

  it("no rompe con una tabla vacía", () => {
    expect(buildTableExport([], 10, ["amount"])).toEqual({
      rows: [],
      count: 0,
      truncated: false,
    });
  });
});
