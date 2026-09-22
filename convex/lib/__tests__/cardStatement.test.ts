import { describe, expect, it } from "vitest";
import { computeStatement } from "../cardStatement";

// Ciclo: corte anterior el 25 ago, próximo corte el 25 sep
const prevCutoffTs = new Date(2026, 7, 25, 23, 59, 59, 999).getTime();
const nextCutoffTs = new Date(2026, 8, 25, 23, 59, 59, 999).getTime();
const day = (m: number, d: number) => new Date(2026, m - 1, d, 12).getTime();

// `remaining`: lo que la cuota debe hoy (0 si está saldada)
const cuota = (remaining: number, dueDate: number, paid = false) => ({ remaining: paid ? 0 : remaining, dueDate });

function sum(s: ReturnType<typeof computeStatement>) {
  return s.porPagar + s.enCurso + s.cuotasPorFacturar + s.sinDetalle;
}

describe("computeStatement", () => {
  it("tarjeta sin deuda: todo en cero", () => {
    expect(computeStatement({ installments: [], currentBalance: 0, prevCutoffTs, nextCutoffTs })).toEqual({
      porPagar: 0,
      enCurso: 0,
      cuotasPorFacturar: 0,
      sinDetalle: 0,
      deudaTotal: 0,
    });
  });

  it("reparte las cuotas pendientes entre el extracto cerrado, el ciclo abierto y las futuras", () => {
    const s = computeStatement({
      installments: [
        cuota(100, day(8, 10)),        // cargada antes del corte anterior → extracto cerrado
        cuota(200, day(9, 10)),        // dentro del ciclo abierto
        cuota(300, day(10, 10)),       // después del próximo corte
        cuota(999, day(7, 10), true),  // pagada: no cuenta
      ],
      currentBalance: 600,
      prevCutoffTs,
      nextCutoffTs,
    });
    expect(s).toMatchObject({ porPagar: 100, enCurso: 200, cuotasPorFacturar: 300, sinDetalle: 0, deudaTotal: 600 });
  });

  it("la deuda que no corresponde a ninguna cuota (deuda inicial) va aparte, no al pago mínimo", () => {
    const s = computeStatement({
      installments: [cuota(100, day(8, 10))],
      currentBalance: 2_100,
      prevCutoffTs,
      nextCutoffTs,
    });
    expect(s).toMatchObject({ porPagar: 100, sinDetalle: 2_000, deudaTotal: 2_100 });
  });

  it("si las cuotas explican más deuda de la que hay, la diferencia sale de lo más antiguo primero", () => {
    // Cuotas por 600, pero la deuda es 520 (p. ej. datos del modelo anterior)
    const s = computeStatement({
      installments: [cuota(50, day(8, 10)), cuota(200, day(9, 10)), cuota(350, day(10, 10))],
      currentBalance: 520,
      prevCutoffTs,
      nextCutoffTs,
    });
    expect(s).toMatchObject({ porPagar: 0, enCurso: 170, cuotasPorFacturar: 350, sinDetalle: 0 });
  });

  it("las cuatro cifras siempre suman la deuda total", () => {
    const cases = [
      { installments: [cuota(100, day(8, 1)), cuota(100, day(9, 1))], currentBalance: 150 },
      { installments: [cuota(100, day(10, 1))], currentBalance: 1_000 },
      { installments: [], currentBalance: 700 },
    ];
    for (const c of cases) {
      const s = computeStatement({ ...c, prevCutoffTs, nextCutoffTs });
      expect(sum(s)).toBe(c.currentBalance);
      expect(s.deudaTotal).toBe(c.currentBalance);
    }
  });
});
