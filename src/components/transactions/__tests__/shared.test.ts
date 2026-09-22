import { describe, expect, it } from "vitest";
import type { Id } from "../../../../convex/_generated/dataModel";
import { canDeleteTx, isFromCardPurchase } from "../shared";

const cuota = {
  type: "gasto_tarjeta" as const,
  cardPurchaseId: "p1" as Id<"cardPurchases">,
  cardInstallmentId: "i1" as Id<"cardInstallments">,
  cardChargeKind: "cuota" as const,
};
const interes = { ...cuota, cardChargeKind: "interes" as const };

describe("isFromCardPurchase", () => {
  it("una cuota abre su compra", () => {
    expect(isFromCardPurchase(cuota)).toBe(true);
  });

  it("el interés de una cuota abre su propio detalle, donde se ajusta al extracto", () => {
    expect(isFromCardPurchase(interes)).toBe(false);
  });
});

describe("canDeleteTx", () => {
  it("una cuota o su interés no se borran sueltos: se borra la compra", () => {
    expect(canDeleteTx(cuota)).toBe(false);
    expect(canDeleteTx(interes)).toBe(false);
  });

  it("una reasignación no se borra", () => {
    expect(canDeleteTx({ type: "ajuste" })).toBe(false);
  });

  it("un gasto normal sí", () => {
    expect(canDeleteTx({ type: "gasto" })).toBe(true);
  });
});
