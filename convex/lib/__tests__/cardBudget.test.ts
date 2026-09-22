import { describe, expect, it } from "vitest";
import { categoryRotationDeltas } from "../cardBudget";

// Cuota de una compra con interés: 416.106 = 392.106 capital + 24.000 interés
const cuotas = [
  { month: "2026-10", amount: 416_106, principalAmount: 392_106, interestAmount: 24_000 },
  { month: "2026-11", amount: 416_106, principalAmount: 399_948, interestAmount: 16_158 },
];

describe("categoryRotationDeltas", () => {
  it("al cambiar de categoría mueve solo el capital; el interés se queda en Gastos financieros", () => {
    const deltas = categoryRotationDeltas({
      installments: cuotas,
      oldCategoryId: "entretenimiento",
      newCategoryId: "hogar",
      interestsCategoryId: "financieros",
    });
    expect(deltas).toEqual([
      { categoryId: "entretenimiento", month: "2026-10", delta: -392_106 },
      { categoryId: "hogar", month: "2026-10", delta: 392_106 },
      { categoryId: "entretenimiento", month: "2026-11", delta: -399_948 },
      { categoryId: "hogar", month: "2026-11", delta: 399_948 },
    ]);
  });

  it("al quitar la categoría el interés no sale de Gastos financieros", () => {
    const deltas = categoryRotationDeltas({
      installments: cuotas,
      oldCategoryId: "entretenimiento",
      newCategoryId: undefined,
      interestsCategoryId: "financieros",
    });
    expect(deltas.filter((d) => d.categoryId === "financieros")).toEqual([]);
    expect(deltas).toEqual([
      { categoryId: "entretenimiento", month: "2026-10", delta: -392_106 },
      { categoryId: "entretenimiento", month: "2026-11", delta: -399_948 },
    ]);
  });

  it("sin categoría de intereses, la cuota entera viaja con la categoría de la compra", () => {
    const deltas = categoryRotationDeltas({
      installments: [cuotas[0]],
      oldCategoryId: undefined,
      newCategoryId: "hogar",
      interestsCategoryId: undefined,
    });
    expect(deltas).toEqual([{ categoryId: "hogar", month: "2026-10", delta: 416_106 }]);
  });
});
