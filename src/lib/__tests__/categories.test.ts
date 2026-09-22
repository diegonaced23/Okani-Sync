import { describe, expect, it } from "vitest";
import { selectableCategories } from "../categories";

const comida = { _id: "c1", type: "gasto" as const };
const salario = { _id: "c2", type: "ingreso" as const };
const regalos = { _id: "c3", type: "ambos" as const };
const pagoTarjeta = { _id: "s1", type: "gasto" as const, isSystem: true };

const all = [comida, salario, regalos, pagoTarjeta];

describe("selectableCategories", () => {
  it("ofrece las del tipo pedido y las de ambos tipos", () => {
    expect(selectableCategories(all, "gasto").map((c) => c._id)).toEqual(["c1", "c3"]);
    expect(selectableCategories(all, "ingreso").map((c) => c._id)).toEqual(["c2", "c3"]);
  });

  it("nunca ofrece una categoría de sistema: esas las asigna la app", () => {
    expect(selectableCategories(all, "gasto")).not.toContain(pagoTarjeta);
  });

  it("conserva la de sistema que el movimiento ya tiene, para no dejar el selector en blanco", () => {
    const ids = selectableCategories(all, "gasto", "s1").map((c) => c._id);
    expect(ids).toEqual(["c1", "c3", "s1"]);
  });
});
