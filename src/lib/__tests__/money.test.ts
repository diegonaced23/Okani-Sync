import { describe, it, expect } from "vitest";
import {
  toCents,
  fromCents,
  formatCurrency,
  formatCents,
  calculateInstallment,
  convertCurrency,
  toMonthString,
  currentMonth,
} from "../money";

// ─── toCents / fromCents ─────────────────────────────────────────────────────

describe("toCents", () => {
  it("convierte valor humano a centavos", () => {
    expect(toCents(1500)).toBe(150000);
    expect(toCents(1500.5)).toBe(150050);
    expect(toCents(0)).toBe(0);
  });

  it("redondea correctamente valores con más de 2 decimales", () => {
    // 1.005 * 100 = 100.4999... en IEEE 754 → Math.round → 100 (no 101)
    expect(toCents(1.005)).toBe(100);
    expect(toCents(0.001)).toBe(0);
    expect(toCents(1.999)).toBe(200); // 199.9 → redondea a 200
  });
});

describe("fromCents", () => {
  it("convierte centavos a valor humano", () => {
    expect(fromCents(150000)).toBe(1500);
    expect(fromCents(150050)).toBe(1500.5);
    expect(fromCents(0)).toBe(0);
  });

  it("es inverso de toCents para enteros", () => {
    const value = 123456;
    expect(fromCents(toCents(value))).toBe(value);
  });
});

// ─── formatCurrency / formatCents ────────────────────────────────────────────

describe("formatCurrency", () => {
  it("formatea COP sin decimales", () => {
    const result = formatCurrency(1500, "COP");
    expect(result).toContain("1.500"); // separador de miles
  });

  it("formatea USD con 2 decimales", () => {
    const result = formatCurrency(1500.5, "USD");
    expect(result).toContain("1.500,50");
  });
});

describe("formatCents", () => {
  it("formatea centavos directamente", () => {
    const result = formatCents(150000, "COP");
    expect(result).toContain("1.500");
  });
});

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
  // Ejemplo del plan: 500.000 COP × 8% mensual × 3 cuotas → cuota ≈ 194.017 COP
  it("calcula cuota del ejemplo del plan", () => {
    const result = calculateInstallment(50000000, 0.08, 3); // 500.000 en centavos
    expect(result.amountPerInstallment).toBeCloseTo(19401700, -2); // ±100 COP
    expect(result.totalInterest).toBeGreaterThan(0);
    expect(result.schedule).toHaveLength(3);
  });

  it("la suma de principalAmount ≈ monto original", () => {
    const principal = 50000000; // 500.000 COP en centavos
    const result = calculateInstallment(principal, 0.08, 3);
    const sumPrincipal = result.schedule.reduce((s, i) => s + i.principalAmount, 0);
    // Tolerancia de ±1 centavo por redondeo por cuota
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

  it("interés decrece con cada cuota (saldo restante reduce)", () => {
    const result = calculateInstallment(100000, 0.05, 6);
    for (let i = 1; i < result.schedule.length; i++) {
      expect(result.schedule[i].interestAmount).toBeLessThanOrEqual(
        result.schedule[i - 1].interestAmount
      );
    }
  });
});

// ─── convertCurrency ─────────────────────────────────────────────────────────

describe("convertCurrency", () => {
  it("convierte COP a USD con tasa dada", () => {
    // 1 USD = 4200 COP → 4200 COP = 1 USD → en centavos: 420000 COP ÷ 4200
    // pero la función multiplica: amount * rate
    // 100 centavos USD × 4200 = 420000 centavos COP
    expect(convertCurrency(100, 4200)).toBe(420000);
  });

  it("respeta el redondeo", () => {
    expect(convertCurrency(1, 3.14159)).toBe(3);
  });
});

// ─── toMonthString / currentMonth ────────────────────────────────────────────

describe("toMonthString", () => {
  it("genera formato YYYY-MM", () => {
    const ts = new Date(2026, 3, 28).getTime(); // Abril 2026
    expect(toMonthString(ts)).toBe("2026-04");
  });

  it("agrega cero para meses del 1 al 9", () => {
    const ts = new Date(2026, 0, 1).getTime(); // Enero 2026
    expect(toMonthString(ts)).toBe("2026-01");
  });
});

describe("currentMonth", () => {
  it("retorna el mes actual en formato YYYY-MM", () => {
    const result = currentMonth();
    expect(result).toMatch(/^\d{4}-\d{2}$/);
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    expect(result).toBe(expected);
  });
});
