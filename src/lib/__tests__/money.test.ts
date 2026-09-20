import { describe, it, expect } from "vitest";
import {
  toCents,
  fromCents,
  formatCurrency,
  formatCents,
  calculateInstallment,
  toMonthString,
  currentMonth,
  addMonthsClamped,
  shiftMonth,
  monthsEndingAt,
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

describe("addMonthsClamped", () => {
  const ymd = (ts: number) => {
    const d = new Date(ts);
    return [d.getFullYear(), d.getMonth() + 1, d.getDate()];
  };

  it("no desborda el mes: 31 de enero + 1 mes es el 28 de febrero", () => {
    expect(ymd(addMonthsClamped(new Date(2026, 0, 31, 12).getTime(), 1))).toEqual([2026, 2, 28]);
  });

  it("recorta al 29 en un año bisiesto", () => {
    expect(ymd(addMonthsClamped(new Date(2028, 0, 31, 12).getTime(), 1))).toEqual([2028, 2, 29]);
  });

  it("31 de marzo + 1 mes es el 30 de abril", () => {
    expect(ymd(addMonthsClamped(new Date(2026, 2, 31, 12).getTime(), 1))).toEqual([2026, 4, 30]);
  });

  it("cruza el año", () => {
    expect(ymd(addMonthsClamped(new Date(2026, 11, 15, 12).getTime(), 1))).toEqual([2027, 1, 15]);
  });

  it("conserva el día cuando cabe", () => {
    expect(ymd(addMonthsClamped(new Date(2026, 0, 15, 12).getTime(), 3))).toEqual([2026, 4, 15]);
  });

  it("conserva la hora", () => {
    const d = new Date(addMonthsClamped(new Date(2026, 0, 31, 12, 0, 0).getTime(), 1));
    expect([d.getHours(), d.getMinutes()]).toEqual([12, 0]);
  });

  it("con 0 meses devuelve el mismo instante", () => {
    const ts = new Date(2026, 5, 10, 12).getTime();
    expect(addMonthsClamped(ts, 0)).toBe(ts);
  });
});

describe("shiftMonth", () => {
  it("retrocede cruzando el año", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-02", -14)).toBe("2024-12");
  });

  it("avanza cruzando el año", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it("devuelve el mismo mes con delta cero", () => {
    expect(shiftMonth("2026-09", 0)).toBe("2026-09");
  });
});

describe("monthsEndingAt", () => {
  it("termina en el ancla y va en orden ascendente", () => {
    expect(monthsEndingAt("2026-03", 4)).toEqual(["2025-12", "2026-01", "2026-02", "2026-03"]);
  });

  it("con un solo mes devuelve el ancla", () => {
    expect(monthsEndingAt("2026-09", 1)).toEqual(["2026-09"]);
  });

  it("devuelve exactamente la cantidad pedida", () => {
    // Un off-by-one aquí pediría trece meses a una query que topa en doce y el mes
    // más antiguo se caería en silencio
    expect(monthsEndingAt("2026-09", 12)).toHaveLength(12);
    expect(monthsEndingAt("2026-09", 12)[0]).toBe("2025-10");
  });
});
