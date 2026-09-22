import { describe, expect, it } from "vitest";
import { mergeRecent } from "../recent";

const tx = (id: string, date: number) => ({ _id: id, date, description: id });
const purchase = (id: string, purchaseDate: number, totalInstallments: number, billsAtCutoff = true) => ({
  _id: id,
  purchaseDate,
  totalInstallments,
  billsAtCutoff,
  description: id,
  totalAmount: 1_200_000,
  currency: "COP",
  cardId: "c1",
  categoryId: undefined,
});

describe("mergeRecent", () => {
  it("una compra a cuotas aparece el día de la compra, antes de facturarse su primera cuota", () => {
    const rows = mergeRecent([tx("cafe", 5)], [purchase("tv", 10, 3)], 5);
    expect(rows.map((r) => r.kind + ":" + r._id)).toEqual(["purchase:tv", "tx:cafe"]);
    expect(rows[0]).toMatchObject({ date: 10, amount: 1_200_000, totalInstallments: 3 });
  });

  it("una compra de contado no se repite: ya tiene su movimiento desde el día de la compra", () => {
    const rows = mergeRecent([tx("cafe", 5)], [purchase("pan", 10, 1)], 5);
    expect(rows.map((r) => r._id)).toEqual(["cafe"]);
  });

  it("una compra del modelo anterior tampoco: su cuota 1 ya la representa", () => {
    const rows = mergeRecent([], [purchase("vieja", 10, 3, false)], 5);
    expect(rows).toEqual([]);
  });

  it("ordena de lo más reciente a lo más antiguo y respeta el límite", () => {
    const rows = mergeRecent([tx("a", 1), tx("c", 3)], [purchase("b", 2, 2)], 2);
    expect(rows.map((r) => r._id)).toEqual(["c", "b"]);
  });
});
