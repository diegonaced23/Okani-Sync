import { describe, it, expect } from "vitest";
import {
  autoCardName, eaToMonthly, getNextCutoffTs, getNextPaymentTs, getPrevCutoffTs, monthlyToEa,
} from "../cardCycle";
import { dueOf } from "@/components/cards/shared";

const ymd = (ts: number) => {
  const d = new Date(ts);
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()];
};

describe("getNextCutoffTs", () => {
  it("antes del corte, el próximo corte es este mes", () => {
    expect(ymd(getNextCutoffTs(25, new Date(2026, 4, 17)))).toEqual([2026, 5, 25]);
  });

  it("el mismo día del corte, pasa al mes siguiente", () => {
    expect(ymd(getNextCutoffTs(25, new Date(2026, 4, 25)))).toEqual([2026, 6, 25]);
  });

  it("clampea el día 31 al último día de febrero", () => {
    expect(ymd(getNextCutoffTs(31, new Date(2026, 1, 10)))).toEqual([2026, 2, 28]);
  });

  it("cruza el año en diciembre", () => {
    expect(ymd(getNextCutoffTs(15, new Date(2026, 11, 20)))).toEqual([2027, 1, 15]);
  });
});

describe("getNextPaymentTs", () => {
  it("el pago cae en el mes siguiente al corte", () => {
    const cutoff = new Date(2026, 4, 25, 23, 59).getTime();
    expect(ymd(getNextPaymentTs(5, cutoff))).toEqual([2026, 6, 5]);
  });

  it("también cuando el día de pago es mayor que el de corte", () => {
    const cutoff = new Date(2026, 4, 10, 23, 59).getTime();
    expect(ymd(getNextPaymentTs(28, cutoff))).toEqual([2026, 6, 28]);
  });

  it("cruza el año si el corte es en diciembre", () => {
    const cutoff = new Date(2026, 11, 25, 23, 59).getTime();
    expect(ymd(getNextPaymentTs(5, cutoff))).toEqual([2027, 1, 5]);
  });
});

describe("autoCardName", () => {
  it("combina marca, banco y últimos 4", () => {
    expect(autoCardName("visa", " Bancolombia ", "1234")).toBe("Visa Bancolombia ···1234");
  });

  it("omite la marca genérica y los dígitos incompletos", () => {
    expect(autoCardName("otro", "Nu", "12")).toBe("Nu");
  });

  it("nunca devuelve un nombre vacío", () => {
    expect(autoCardName("otro", "", "")).toBe("Tarjeta de crédito");
  });
});

describe("conversión de tasas", () => {
  it("28% E.A. equivale a ~2,08% m.v.", () => {
    expect(eaToMonthly(0.28)).toBeCloseTo(0.020785, 5);
  });

  it("ida y vuelta conserva el valor", () => {
    expect(monthlyToEa(eaToMonthly(0.3))).toBeCloseTo(0.3, 10);
  });

  it("0% se mantiene en 0%", () => {
    expect(eaToMonthly(0)).toBe(0);
    expect(monthlyToEa(0)).toBe(0);
  });
});

describe("getPrevCutoffTs", () => {
  it("antes del corte, el corte cerrado es el del mes pasado", () => {
    expect(ymd(getPrevCutoffTs(25, new Date(2026, 9, 1)))).toEqual([2026, 9, 25]);
  });

  it("pasado el corte, el corte cerrado es el de este mes", () => {
    expect(ymd(getPrevCutoffTs(25, new Date(2026, 9, 26)))).toEqual([2026, 10, 25]);
  });

  it("en enero antes del corte retrocede a diciembre", () => {
    expect(ymd(getPrevCutoffTs(25, new Date(2026, 0, 5)))).toEqual([2025, 12, 25]);
  });

  it("clampa el día al último del mes", () => {
    expect(ymd(getPrevCutoffTs(31, new Date(2026, 2, 5)))).toEqual([2026, 2, 28]);
  });
});

describe("dueOf", () => {
  const card = { cutoffDay: 25, paymentDay: 5 };

  it("entre el corte y el pago apunta al pago del ciclo ya cerrado", () => {
    // El extracto del 25 de septiembre se paga el 5 de octubre, no el 5 de noviembre
    const due = dueOf(card, new Date(2026, 9, 1, 10).getTime());
    expect(ymd(due.ts)).toEqual([2026, 10, 5]);
    expect(due.days).toBe(4);
    expect(due.urgent).toBe(true);
  });

  it("el mismo día del pago dice que se paga hoy", () => {
    const due = dueOf(card, new Date(2026, 9, 5, 18).getTime());
    expect(due.days).toBe(0);
    expect(due.text).toBe("Paga hoy");
  });

  it("pasado el día de pago apunta al pago del ciclo siguiente", () => {
    const due = dueOf(card, new Date(2026, 9, 6, 10).getTime());
    expect(ymd(due.ts)).toEqual([2026, 11, 5]);
    expect(due.urgent).toBe(false);
  });

  it("pasado el corte, el pago es el del mes siguiente", () => {
    const due = dueOf(card, new Date(2026, 9, 26, 10).getTime());
    expect(ymd(due.ts)).toEqual([2026, 11, 5]);
  });

  it("nunca devuelve días negativos", () => {
    for (const day of [1, 5, 6, 15, 25, 26, 28]) {
      expect(dueOf(card, new Date(2026, 9, day, 12).getTime()).days).toBeGreaterThanOrEqual(0);
    }
  });
});
