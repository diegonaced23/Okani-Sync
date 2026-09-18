import { describe, it, expect } from "vitest";
import { computeMonthPace } from "../monthPace";

// 15 de septiembre de 2026: día 15 de 30 → mitad del mes
const mid = new Date(2026, 8, 15);

describe("computeMonthPace", () => {
  it("calcula el avance del mes contando el día de hoy", () => {
    const p = computeMonthPace(100, 0, mid);
    expect(p.day).toBe(15);
    expect(p.daysInMonth).toBe(30);
    expect(p.elapsed).toBe(0.5);
  });

  it("sin ingresos ni gastos está vacío", () => {
    expect(computeMonthPace(0, 0, mid).status).toBe("vacio");
  });

  it("con gastos y sin ingresos no calcula porcentaje", () => {
    const p = computeMonthPace(0, 5000, mid);
    expect(p.status).toBe("sin-ingresos");
    expect(p.spent).toBe(0);
    expect(p.net).toBe(-5000);
  });

  it("gastar al ritmo del mes está en ritmo", () => {
    expect(computeMonthPace(1000, 550, mid).status).toBe("en-ritmo");
  });

  it("gastar más de 10 puntos por encima del avance es ir rápido", () => {
    expect(computeMonthPace(1000, 700, mid).status).toBe("rapido");
  });

  it("gastar más de lo ingresado es excederse", () => {
    const p = computeMonthPace(1000, 1200, mid);
    expect(p.status).toBe("excedido");
    expect(p.spent).toBeCloseTo(1.2);
    expect(p.net).toBe(-200);
  });

  it("gastar exactamente lo ingresado todavía no es excederse", () => {
    const end = new Date(2026, 8, 30);
    expect(computeMonthPace(1000, 1000, end).status).toBe("en-ritmo");
  });
});
