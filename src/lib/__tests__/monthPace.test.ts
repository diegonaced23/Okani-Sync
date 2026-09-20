import { describe, it, expect } from "vitest";
import { computeMonthPace } from "../monthPace";
import { deadlineLabel } from "@/components/goals/shared";

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

describe("deadlineLabel", () => {
  const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
  // Las fechas límite se guardan al mediodía local (dateStrToTs)
  const deadline = at(2026, 6, 10);

  it("dice que vence hoy durante todo el día, no solo por la tarde", () => {
    expect(deadlineLabel(deadline, at(2026, 6, 10, 8)).text).toBe("Vence hoy");
    expect(deadlineLabel(deadline, at(2026, 6, 10, 20)).text).toBe("Vence hoy");
  });

  it("una fecha de ayer está vencida desde la primera hora de hoy", () => {
    const yesterday = at(2026, 6, 9);
    const info = deadlineLabel(yesterday, at(2026, 6, 10, 9));
    expect(info.overdue).toBe(true);
    expect(info.text).toBe("Fecha vencida");
  });

  it("mañana es un día, a cualquier hora", () => {
    expect(deadlineLabel(deadline, at(2026, 6, 9, 8)).text).toBe("Queda 1 día");
    expect(deadlineLabel(deadline, at(2026, 6, 9, 23)).text).toBe("Queda 1 día");
  });

  it("marca urgencia dentro de la semana", () => {
    expect(deadlineLabel(deadline, at(2026, 6, 5)).urgent).toBe(true);
    expect(deadlineLabel(deadline, at(2026, 6, 1)).urgent).toBe(false);
  });
});
