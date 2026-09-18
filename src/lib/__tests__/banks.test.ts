import { describe, it, expect } from "vitest";
import { BANK_NAME_MAX, CARD_BANKS, findBank } from "../banks";

describe("CARD_BANKS", () => {
  it("no tiene nombres repetidos", () => {
    const names = CARD_BANKS.map((b) => b.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("todos los nombres caben en el límite del backend", () => {
    expect(CARD_BANKS.every((b) => b.name.length <= BANK_NAME_MAX)).toBe(true);
  });

  it("está en orden alfabético", () => {
    const names = CARD_BANKS.map((b) => b.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "es")));
  });
});

describe("findBank", () => {
  it("encuentra un banco del catálogo", () => {
    expect(findBank("Davivienda")?.color).toBe("g-red");
  });

  it("no encuentra nombres fuera del catálogo", () => {
    expect(findBank("Mi banco inventado")).toBeUndefined();
  });
});
