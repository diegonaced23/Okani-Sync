import { describe, expect, it } from "vitest";
import { balanceScheduleToPrincipal, cuotaChargeDates, cuotaExpenseDates } from "../cardSchedule";
import { calculateInstallment } from "../money";

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const cutoff = (y: number, m: number, d: number) => new Date(y, m - 1, d, 23, 59, 59, 999).getTime();

describe("cuotaChargeDates", () => {
  it("una compra de contado se carga el día de la compra", () => {
    expect(cuotaChargeDates(at(2026, 9, 22), 25, 1)).toEqual([at(2026, 9, 22)]);
  });

  it("a cuotas, la primera se factura en el corte del ciclo de la compra y las demás en los siguientes", () => {
    expect(cuotaChargeDates(at(2026, 9, 22), 25, 3)).toEqual([
      cutoff(2026, 9, 25),
      cutoff(2026, 10, 25),
      cutoff(2026, 11, 25),
    ]);
  });

  it("una compra después del corte pasa al ciclo siguiente", () => {
    expect(cuotaChargeDates(at(2026, 9, 27), 25, 2)).toEqual([cutoff(2026, 10, 25), cutoff(2026, 11, 25)]);
  });

  it("una compra el mismo día del corte entra en ese corte", () => {
    expect(cuotaChargeDates(at(2026, 9, 25, 20), 25, 1 + 1)[0]).toBe(cutoff(2026, 9, 25));
  });

  it("un corte el 31 cae el último día de los meses cortos, sin correrse al mes siguiente", () => {
    expect(cuotaChargeDates(at(2027, 1, 10), 31, 3)).toEqual([
      cutoff(2027, 1, 31),
      cutoff(2027, 2, 28),
      cutoff(2027, 3, 31),
    ]);
  });

  it("cruza el año", () => {
    expect(cuotaChargeDates(at(2026, 12, 28), 25, 2)).toEqual([cutoff(2027, 1, 25), cutoff(2027, 2, 25)]);
  });
});

describe("balanceScheduleToPrincipal", () => {
  it("la última cuota absorbe el redondeo: el capital de las cuotas suma exactamente la compra", () => {
    const { schedule } = calculateInstallment(10_000, 0, 3); // 3 × 3.333 = 9.999
    const fixed = balanceScheduleToPrincipal(schedule, 10_000);
    expect(fixed.reduce((s, i) => s + i.principalAmount, 0)).toBe(10_000);
    expect(fixed[2]).toMatchObject({ principalAmount: 3_334, amount: 3_334, remainingPrincipal: 0 });
  });

  it("también con interés", () => {
    const { schedule } = calculateInstallment(120_000_000, 0.02, 3);
    const fixed = balanceScheduleToPrincipal(schedule, 120_000_000);
    expect(fixed.reduce((s, i) => s + i.principalAmount, 0)).toBe(120_000_000);
    for (const i of fixed) expect(i.amount).toBe(i.principalAmount + i.interestAmount);
  });

  it("si ya cuadra, no cambia nada", () => {
    const { schedule } = calculateInstallment(9_000, 0, 3);
    expect(balanceScheduleToPrincipal(schedule, 9_000)).toEqual(schedule);
  });
});

describe("cuotaExpenseDates", () => {
  it("la primera cuota es gasto el día de la compra, y cada una la sigue mes a mes", () => {
    expect(cuotaExpenseDates(at(2026, 9, 20), 3)).toEqual([at(2026, 9, 20), at(2026, 10, 20), at(2026, 11, 20)]);
  });

  it("no depende del corte: una compra después del corte sigue siendo gasto de su mes", () => {
    expect(cuotaExpenseDates(at(2026, 9, 25), 1)).toEqual([at(2026, 9, 25)]);
  });

  it("una compra el 31 cae en el último día real de los meses cortos", () => {
    const [ene, feb, mar] = cuotaExpenseDates(at(2027, 1, 31), 3);
    expect(new Date(feb).getMonth()).toBe(1);
    expect(new Date(feb).getDate()).toBe(28);
    expect(new Date(ene).getDate()).toBe(31);
    expect(new Date(mar).getDate()).toBe(31);
  });
});
