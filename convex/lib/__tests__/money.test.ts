import { describe, it, expect } from "vitest";
import { calculateInstallment, buildRateMap, convertAmount } from "../money";

// ─── calculateInstallment ────────────────────────────────────────────────────

describe("calculateInstallment — sin interés", () => {
  it("divide el monto equitativamente", () => {
    const result = calculateInstallment(300000, 0, 3);
    expect(result.amountPerInstallment).toBe(100000);
    expect(result.totalWithInterest).toBe(300000);
    expect(result.totalInterest).toBe(0);
    expect(result.schedule).toHaveLength(3);
    result.schedule.forEach((s) => {
      expect(s.interestAmount).toBe(0);
      expect(s.principalAmount).toBe(s.amount);
    });
  });

  it("compra de 1 cuota = monto completo", () => {
    const result = calculateInstallment(500000, 0, 1);
    expect(result.amountPerInstallment).toBe(500000);
    expect(result.schedule).toHaveLength(1);
  });
});

describe("calculateInstallment — con interés compuesto", () => {
  it("la suma de principalAmount ≈ monto original", () => {
    const principal = 50000000; // 500.000 COP en centavos
    const result = calculateInstallment(principal, 0.08, 3);
    const sumPrincipal = result.schedule.reduce((s, i) => s + i.principalAmount, 0);
    expect(Math.abs(sumPrincipal - principal)).toBeLessThanOrEqual(3);
  });

  it("el saldo restante al final es 0", () => {
    const result = calculateInstallment(50000000, 0.08, 3);
    const last = result.schedule[result.schedule.length - 1];
    expect(last.remainingPrincipal).toBe(0);
  });

  it("cada cuota: amount = principalAmount + interestAmount", () => {
    const result = calculateInstallment(100000, 0.05, 6);
    result.schedule.forEach((s) => {
      expect(s.amount).toBe(s.principalAmount + s.interestAmount);
    });
  });
});

// ─── buildRateMap ─────────────────────────────────────────────────────────────

describe("buildRateMap", () => {
  it("filtra solo las tasas hacia la moneda destino", () => {
    const rates = [
      { fromCurrency: "USD", toCurrency: "COP", rate: 4200 },
      { fromCurrency: "EUR", toCurrency: "COP", rate: 4600 },
      { fromCurrency: "COP", toCurrency: "USD", rate: 0.00024 },
    ];
    const map = buildRateMap(rates, "COP");
    expect(map.get("USD")).toBe(4200);
    expect(map.get("EUR")).toBe(4600);
    expect(map.has("COP")).toBe(false); // esa tasa apunta a USD, no a COP
  });

  it("devuelve un mapa vacío si no hay tasas hacia la moneda destino", () => {
    const map = buildRateMap([{ fromCurrency: "USD", toCurrency: "EUR", rate: 0.9 }], "COP");
    expect(map.size).toBe(0);
  });
});

// ─── convertAmount ────────────────────────────────────────────────────────────

describe("convertAmount", () => {
  it("misma moneda: no convierte, hasRate=true", () => {
    const rateMap = buildRateMap([], "COP");
    const result = convertAmount(150050, "COP", "COP", rateMap);
    expect(result).toEqual({ converted: 150050, hasRate: true });
  });

  it("convierte usando la tasa del mapa", () => {
    const rateMap = buildRateMap([{ fromCurrency: "USD", toCurrency: "COP", rate: 4200 }], "COP");
    const result = convertAmount(100, "USD", "COP", rateMap); // 1 USD en centavos
    expect(result).toEqual({ converted: 420000, hasRate: true });
  });

  it("redondea el resultado convertido", () => {
    const rateMap = buildRateMap([{ fromCurrency: "USD", toCurrency: "COP", rate: 3.14159 }], "COP");
    const result = convertAmount(1, "USD", "COP", rateMap);
    expect(result.converted).toBe(3);
  });

  it("sin tasa disponible: hasRate=false y devuelve el monto crudo (el caller decide si excluirlo)", () => {
    const rateMap = buildRateMap([], "COP"); // sin tasas cargadas
    const result = convertAmount(100, "USD", "COP", rateMap);
    expect(result).toEqual({ converted: 100, hasRate: false });
  });
});
