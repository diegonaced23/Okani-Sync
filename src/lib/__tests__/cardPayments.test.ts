import { describe, expect, it } from "vitest";
import { allocatePayments, installmentDue, installmentRemaining, isNotYetExpensed, simulateCardPayment, totalPaidFor } from "../cardPayments";

describe("installmentDue", () => {
  const cuota = { amount: 416_106, principalAmount: 392_106, interestAmount: 24_000 };

  it("antes de facturarse, la cuota solo debe su capital: el interés aún no se ha cobrado", () => {
    expect(installmentDue({ ...cuota, interestBilling: "at_cutoff" })).toBe(392_106);
  });

  it("facturada, debe capital más interés", () => {
    expect(installmentDue({ ...cuota, interestBilling: "at_cutoff", billedAt: 1 })).toBe(416_106);
  });

  it("una cuota del modelo anterior (sin migrar) debe la cuota entera, que ya estaba en la deuda", () => {
    expect(installmentDue(cuota)).toBe(416_106);
  });

  it("sin desglose de capital, el capital es la cuota entera", () => {
    expect(installmentDue({ amount: 100_000, interestBilling: "at_cutoff" })).toBe(100_000);
  });
});

describe("totalPaidFor", () => {
  it("lo pagado es lo cargado menos lo que aún se debe", () => {
    expect(totalPaidFor([{ due: 300 }, { due: 200 }], 350)).toBe(150);
  });

  it("la deuda sin cuotas (deuda inicial) se cubre primero: no cuenta como pago a cuotas", () => {
    expect(totalPaidFor([{ due: 300 }], 1_000)).toBe(0);
  });
});

describe("allocatePayments", () => {
  it("reparte lo pagado de la cuota más antigua a la más nueva", () => {
    const items = [
      { due: 200, dueDate: 3 },
      { due: 100, dueDate: 1 },
      { due: 300, dueDate: 2 },
    ];
    // Orden por fecha: 100 (d1), 300 (d2), 200 (d3). Con 250: 100 + 150 de la segunda
    expect(allocatePayments(items, 250)).toEqual([0, 100, 150]);
  });

  it("un abono que no alcanza una cuota entera queda en esa cuota como pago parcial", () => {
    expect(allocatePayments([{ due: 416_106, dueDate: 1 }, { due: 416_106, dueDate: 2 }], 500_000)).toEqual([
      416_106,
      83_894,
    ]);
  });

  it("nunca asigna más de lo que cada cuota debe", () => {
    expect(allocatePayments([{ due: 100, dueDate: 1 }], 1_000)).toEqual([100]);
  });
});

describe("installmentRemaining", () => {
  it("es lo que la cuota debe hoy menos lo abonado", () => {
    expect(installmentRemaining({ amount: 416_106, principalAmount: 392_106, interestAmount: 24_000, interestBilling: "at_cutoff", billedAt: 1, paidAmount: 100_000 })).toBe(316_106);
  });

  it("una cuota antigua sin paidAmount usa su marca de pagada", () => {
    expect(installmentRemaining({ amount: 100, paid: true })).toBe(0);
    expect(installmentRemaining({ amount: 100, paid: false })).toBe(100);
  });
});

describe("simulateCardPayment", () => {
  const nueva = (id: string, dueDate: number, paidAmount = 0) => ({
    id,
    dueDate,
    amount: 416_106,
    principalAmount: 392_106,
    interestAmount: 24_000,
    interestBilling: "at_cutoff" as const,
    billedAt: 1,
    paidAmount,
  });

  it("anticipa qué cuotas quedan saldadas y cuáles siguen debiendo", () => {
    const cuotas = [nueva("a", 1), nueva("b", 2)];
    const r = simulateCardPayment(cuotas, 832_212, 500_000);
    expect(r.newlyPaid.map((c) => c.id)).toEqual(["a"]);
    expect(r.stillUnpaid.map((c) => c.id)).toEqual(["b"]);
    expect(r.newBalance).toBe(332_212);
  });

  it("no cuenta como recién pagada una cuota que ya estaba saldada", () => {
    const cuotas = [nueva("a", 1, 416_106), nueva("b", 2)];
    const r = simulateCardPayment(cuotas, 416_106, 416_106);
    expect(r.newlyPaid.map((c) => c.id)).toEqual(["b"]);
    expect(r.stillUnpaid).toEqual([]);
  });

  it("el monto se limita a la deuda", () => {
    expect(simulateCardPayment([nueva("a", 1)], 416_106, 9_000_000).newBalance).toBe(0);
  });
});

describe("isNotYetExpensed", () => {
  const sep = "2026-09";
  const oct15 = new Date(2026, 9, 15, 23, 59).getTime();
  const sep10 = new Date(2026, 8, 10, 12).getTime();

  it("una cuota del modelo nuevo sin facturar todavía no es gasto", () => {
    expect(isNotYetExpensed({ interestBilling: "at_cutoff", dueDate: oct15 }, sep)).toBe(true);
  });

  it("facturada ya es gasto", () => {
    expect(isNotYetExpensed({ interestBilling: "at_cutoff", dueDate: sep10, billedAt: 1 }, sep)).toBe(false);
  });

  it("una cuota antigua es gasto del mes de su fecha: si cae en un mes posterior, aún no cuenta", () => {
    expect(isNotYetExpensed({ dueDate: oct15 }, sep)).toBe(true);
    expect(isNotYetExpensed({ dueDate: sep10 }, sep)).toBe(false);
  });
});
