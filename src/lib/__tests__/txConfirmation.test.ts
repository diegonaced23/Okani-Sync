import { describe, expect, it } from "vitest";
import { buildEditConfirmation, buildTransferConfirmation, buildTxConfirmation } from "../txConfirmation";
import { formatCents } from "../money";

// El separador entre símbolo y cifra depende de la versión de ICU: se compara
// contra formatCents en vez de fijar el espacio
const cop = (cents: number) => formatCents(cents, "COP");

describe("buildTxConfirmation", () => {
  it("un gasto lleva signo menos y la cuenta de origen", () => {
    expect(
      buildTxConfirmation({ kind: "gasto", amountCents: 4_500_000, currency: "COP", description: " Mercado ", accountName: "Bancolombia" }),
    ).toEqual({ title: `−${cop(4_500_000)} · Mercado`, detail: "desde la cuenta Bancolombia" });
  });

  it("un ingreso lleva signo más y la cuenta de destino", () => {
    expect(
      buildTxConfirmation({ kind: "ingreso", amountCents: 250_000_000, currency: "COP", description: "Nómina", accountName: "Nu" }),
    ).toEqual({ title: `+${cop(250_000_000)} · Nómina`, detail: "a la cuenta Nu" });
  });

  it("una compra con tarjeta nombra la tarjeta y solo menciona cuotas si son varias", () => {
    const base = { kind: "compra_tarjeta" as const, amountCents: 30_000_000, currency: "COP", description: "TV", cardName: "Visa Oro" };
    expect(buildTxConfirmation({ ...base, installments: 1 }).detail).toBe("con la tarjeta Visa Oro");
    expect(buildTxConfirmation({ ...base, installments: 12 }).detail).toBe("con la tarjeta Visa Oro a 12 cuotas");
  });

  it("sin nombre de cuenta no inventa el detalle", () => {
    expect(
      buildTxConfirmation({ kind: "gasto", amountCents: 100, currency: "COP", description: "x" }).detail,
    ).toBe("Gasto registrado");
  });

  it("respeta la moneda de la cuenta", () => {
    expect(
      buildTxConfirmation({ kind: "gasto", amountCents: 1_250, currency: "USD", description: "Café", accountName: "Wise" }).title,
    ).toBe(`−${formatCents(1_250, "USD")} · Café`);
  });
});

describe("buildEditConfirmation", () => {
  it("un gasto editado repite monto y descripción como quedaron", () => {
    expect(
      buildEditConfirmation({ type: "gasto", amountCents: 120_000, currency: "COP", description: "Taxi " }),
    ).toEqual({ title: `\u2212${cop(120_000)} · Taxi`, detail: "Cambios guardados" });
  });

  it("un ingreso editado lleva signo más", () => {
    expect(
      buildEditConfirmation({ type: "ingreso", amountCents: 500_000, currency: "COP", description: "Venta" }).title,
    ).toBe(`+${cop(500_000)} · Venta`);
  });

  it("una transferencia no inventa signo ni monto", () => {
    expect(
      buildEditConfirmation({ type: "transferencia", amountCents: 999, currency: "COP", description: "Ahorro" }),
    ).toEqual({ title: "Ahorro", detail: "Transferencia actualizada" });
  });
});

describe("buildTransferConfirmation", () => {
  const base = { amountCents: 20_000_000, currency: "COP", description: "Ahorro", fromName: "ITAU Ahorros", toName: "Nu" };

  it("lleva el monto sin signo y el trayecto", () => {
    expect(buildTransferConfirmation(base)).toEqual({ title: `${cop(20_000_000)} · Ahorro`, detail: "de ITAU Ahorros a Nu" });
  });

  it("sin descripción usa «Transferencia»", () => {
    expect(buildTransferConfirmation({ ...base, description: "  " }).title).toBe(`${cop(20_000_000)} · Transferencia`);
  });

  it("con monedas distintas dice cuánto llega", () => {
    expect(
      buildTransferConfirmation({ ...base, received: { amountCents: 5_000, currency: "USD" } }).detail,
    ).toBe(`de ITAU Ahorros a Nu · llegan ${formatCents(5_000, "USD")}`);
  });
});
