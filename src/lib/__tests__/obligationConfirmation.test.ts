import { describe, expect, it } from "vitest";
import {
  buildDebtCreatedConfirmation,
  buildLoanCreatedConfirmation,
  buildObligationEditConfirmation,
  buildPaymentConfirmation,
} from "../obligationConfirmation";
import { formatCents } from "../money";

// El separador entre símbolo y cifra depende de la versión de ICU: se compara
// contra formatCents en vez de fijar el espacio
const cop = (cents: number) => formatCents(cents, "COP");

describe("buildDebtCreatedConfirmation", () => {
  it("muestra el monto, el nombre y a quién se le debe", () => {
    expect(
      buildDebtCreatedConfirmation({ name: " Crédito carro ", creditor: "Banco X", amountCents: 500_000_000, currency: "COP" }),
    ).toEqual({ title: `${cop(500_000_000)} · Crédito carro`, detail: "Le debes a Banco X" });
  });

  it("añade la cuota mensual si se definió", () => {
    const c = buildDebtCreatedConfirmation({
      name: "Crédito carro", creditor: "Banco X", amountCents: 500_000_000, currency: "COP", monthlyPaymentCents: 45_000_000,
    });
    expect(c.detail).toBe(`Le debes a Banco X · cuota de ${cop(45_000_000)}`);
  });
});

describe("buildLoanCreatedConfirmation", () => {
  it("con cuenta de origen el dinero sale: signo menos y la cuenta", () => {
    expect(
      buildLoanCreatedConfirmation({ borrower: "Juan", amountCents: 20_000_000, currency: "COP", accountName: "Nu" }),
    ).toEqual({ title: `−${cop(20_000_000)} · Préstamo a Juan`, detail: "Salió de la cuenta Nu" });
  });

  it("sin cuenta solo deja constancia de lo que le deben", () => {
    expect(
      buildLoanCreatedConfirmation({ borrower: " Juan ", amountCents: 20_000_000, currency: "COP" }),
    ).toEqual({ title: `${cop(20_000_000)} · Préstamo a Juan`, detail: `Juan te debe ${cop(20_000_000)}` });
  });
});

describe("buildObligationEditConfirmation", () => {
  it("confirma por el nombre", () => {
    expect(buildObligationEditConfirmation(" Hipoteca ")).toEqual({ title: "Hipoteca", detail: "Cambios guardados" });
  });
});

describe("buildPaymentConfirmation", () => {
  const debt = { kind: "debt" as const, name: "Crédito carro", counterpart: "Banco X", currency: "COP", originalAmountCents: 1_000_000 };
  const loan = { kind: "loan" as const, name: "Préstamo a Juan", counterpart: "Juan", currency: "COP", originalAmountCents: 1_000_000 };

  it("un abono parcial a una deuda dice cuánto queda por pagar", () => {
    expect(buildPaymentConfirmation({ ...debt, amountCents: 200_000, balanceCents: 800_000 })).toEqual({
      title: `−${cop(200_000)} · Crédito carro`,
      detail: `Te quedan ${cop(600_000)} por pagar`,
    });
  });

  it("el abono que salda la deuda lo celebra", () => {
    expect(buildPaymentConfirmation({ ...debt, amountCents: 800_000, balanceCents: 800_000 })).toEqual({
      title: "¡Deuda saldada!",
      detail: "Crédito carro · ya no le debes nada a Banco X",
    });
  });

  it("un cobro parcial de un préstamo dice cuánto le falta a la persona", () => {
    expect(buildPaymentConfirmation({ ...loan, amountCents: 300_000, balanceCents: 1_000_000 })).toEqual({
      title: `+${cop(300_000)} · Juan`,
      detail: `Aún te debe ${cop(700_000)}`,
    });
  });

  it("el cobro que salda el préstamo recuerda el total recuperado", () => {
    expect(buildPaymentConfirmation({ ...loan, amountCents: 400_000, balanceCents: 400_000 })).toEqual({
      title: "¡Juan te pagó todo!",
      detail: `Recuperaste los ${cop(1_000_000)} que prestaste`,
    });
  });
});
