import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { USER_DATA_TABLES } from "../userData";

/**
 * La exportación (`convex/exportData.ts`) es la definición de facto de "los
 * datos de este usuario": es lo que se le entrega cuando pide su respaldo. Si
 * una tabla merece salir en el respaldo, merece borrarse en el reset y en la
 * cascada de borrado de usuario.
 *
 * Este test compara ambas listas leyendo el fuente de la exportación. Es algo
 * burdo, pero es exactamente el fallo que ya se coló una vez: la cascada del
 * panel admin cubría 12 tablas y la exportación 15, así que `goals`, `loans`,
 * `loanRepayments` y `netWorthSnapshots` quedaban huérfanas al borrar un
 * usuario, sin que ningún test se enterara.
 */
function tablesReadByExport(): string[] {
  const source = readFileSync(resolve(__dirname, "../../exportData.ts"), "utf8");
  const found = new Set<string>();
  for (const m of source.matchAll(/\.query\("([a-zA-Z]+)"\)/g)) found.add(m[1]);
  return [...found].sort();
}

describe("USER_DATA_TABLES", () => {
  it("cubre exactamente las tablas que entrega la exportación", () => {
    expect([...USER_DATA_TABLES].sort()).toEqual(tablesReadByExport());
  });

  it("no repite ninguna tabla", () => {
    expect(new Set(USER_DATA_TABLES).size).toBe(USER_DATA_TABLES.length);
  });

  it("borra cada hija antes que su padre", () => {
    const pos = (t: string) => USER_DATA_TABLES.indexOf(t as never);
    // [hija, padre] — la hija apunta a la padre, así que va primero.
    const pairs: Array<[string, string]> = [
      ["cardInstallments", "cardPurchases"],
      ["cardPurchases", "cards"],
      ["debtPayments", "debts"],
      ["loanRepayments", "loans"],
      ["debtPayments", "transactions"],
      ["loanRepayments", "transactions"],
      ["transactions", "accounts"],
      ["transactions", "categories"],
      ["budgets", "categories"],
      ["accountShares", "accounts"],
    ];
    for (const [child, parent] of pairs) {
      expect(pos(child), `${child} debe borrarse antes que ${parent}`)
        .toBeLessThan(pos(parent));
    }
  });
});
