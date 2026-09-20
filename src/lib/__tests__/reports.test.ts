import { describe, it, expect } from "vitest";
import { TX_TYPE_CONFIG } from "@/components/transactions/tx-type-config";
import { generateFullLedgerCsv, txTypeLabel, type LedgerMaps, type LedgerTx } from "../reports";

const maps: LedgerMaps = {
  accounts: { acc1: "Ahorros", acc2: "Cuenta USD" },
  cards: { card1: { name: "Visa", lastFour: "4242" } },
  cats: { cat1: "Mercado" },
};

/** Devuelve las filas del CSV como arrays de celdas, sin la cabecera. */
function parse(csv: string): string[][] {
  return csv
    .split("\n")
    .slice(1)
    .filter((line) => line.length > 0)
    .map((line) => line.split(",").map((c) => c.replace(/^"|"$/g, "")));
}

function tx(partial: Partial<LedgerTx>): LedgerTx {
  return {
    _id: "t1",
    date: Date.UTC(2026, 8, 15),
    description: "Movimiento",
    type: "gasto",
    amount: 10_000,
    currency: "COP",
    ...partial,
  };
}

describe("generateFullLedgerCsv", () => {
  it("clasifica los ingresos en Haber y los gastos en Debe", () => {
    const csv = generateFullLedgerCsv(
      [
        tx({ _id: "a", type: "ingreso", amount: 50_000 }),
        tx({ _id: "b", type: "gasto", amount: 20_000 }),
      ],
      maps
    );
    const [ingreso, gasto] = parse(csv);
    // Columnas: Fecha, Descripción, Tipo, Debe, Haber, Saldo acum., …
    expect(ingreso[3]).toBe("");
    expect(ingreso[4]).toBe("500.00");
    expect(gasto[3]).toBe("200.00");
    expect(gasto[4]).toBe("");
  });

  it("lleva un saldo acumulado independiente por moneda", () => {
    const csv = generateFullLedgerCsv(
      [
        tx({ _id: "a", type: "ingreso", amount: 100_000, currency: "COP" }),
        tx({ _id: "b", type: "ingreso", amount: 5_000, currency: "USD" }),
        tx({ _id: "c", type: "gasto", amount: 40_000, currency: "COP" }),
      ],
      maps
    );
    const filas = parse(csv);
    expect(filas[0][5]).toBe("1000.00"); // COP: +1000
    expect(filas[1][5]).toBe("50.00");   // USD: arranca en su propio cero
    expect(filas[2][5]).toBe("600.00");  // COP: 1000 − 400
  });

  it("deja los ajustes fuera de Debe y de Haber", () => {
    // reassignBalance guarda Math.abs(delta): el signo no está en el registro, así
    // que clasificarlo desplazaría el saldo acumulado de todas las filas siguientes.
    const csv = generateFullLedgerCsv(
      [
        tx({ _id: "a", type: "ingreso", amount: 100_000 }),
        tx({ _id: "b", type: "ajuste", amount: 70_000 }),
      ],
      maps
    );
    const [, ajuste] = parse(csv);
    expect(ajuste[3]).toBe("");
    expect(ajuste[4]).toBe("");
    expect(ajuste[5]).toBe("1000.00"); // el saldo no se mueve
    expect(ajuste[2]).toBe("Reasignación bancaria"); // pero la fila se ve
  });

  it("trata la pata entrante de una transferencia como Haber", () => {
    const csv = generateFullLedgerCsv(
      [
        tx({ _id: "a", type: "transferencia", transferDirection: "out", amount: 30_000 }),
        tx({ _id: "b", type: "transferencia", transferDirection: "in", amount: 30_000 }),
      ],
      maps
    );
    const [salida, entrada] = parse(csv);
    expect(salida[3]).toBe("300.00");
    expect(entrada[4]).toBe("300.00");
    expect(entrada[5]).toBe("0.00"); // las dos patas se cancelan
  });

  it("resuelve la fuente de una compra con tarjeta con los últimos cuatro dígitos", () => {
    const csv = generateFullLedgerCsv(
      [tx({ type: "gasto_tarjeta", cardId: "card1", categoryId: "cat1" })],
      maps
    );
    const [fila] = parse(csv);
    expect(fila[6]).toBe("Visa ····4242");
    expect(fila[7]).toBe("Mercado");
  });
});

describe("txTypeLabel", () => {
  it("nombra los tipos que el PDF imprimía en crudo", () => {
    expect(txTypeLabel("gasto_tarjeta")).toBe("Gasto con tarjeta");
    expect(txTypeLabel("prestamo_otorgado")).toBe("Préstamo otorgado");
    expect(txTypeLabel("prestamo_cobrado")).toBe("Préstamo cobrado");
    expect(txTypeLabel("ajuste")).toBe("Reasignación bancaria");
  });

  it("dice lo mismo que la fila en pantalla", () => {
    // El archivo exportado y la lista de movimientos leen la misma tabla: antes
    // «Pago de tarjeta» en pantalla salía como «Pago tarjeta» en el CSV.
    expect(txTypeLabel("pago_tarjeta")).toBe(TX_TYPE_CONFIG.pago_tarjeta.label);
    expect(txTypeLabel("gasto")).toBe(TX_TYPE_CONFIG.gasto.label);
  });

  it("devuelve la clave tal cual si aparece un tipo desconocido", () => {
    expect(txTypeLabel("tipo_nuevo")).toBe("tipo_nuevo");
  });
});
