import { describe, expect, it } from "vitest";
import { dateChipLabel } from "../dateChipLabel";

const TODAY = "2026-09-21";

describe("dateChipLabel", () => {
  it("nombra hoy, ayer y mañana", () => {
    expect(dateChipLabel("2026-09-21", TODAY)).toBe("Hoy");
    expect(dateChipLabel("2026-09-20", TODAY)).toBe("Ayer");
    expect(dateChipLabel("2026-09-22", TODAY)).toBe("Mañana");
  });

  it("otra fecha del año va con día y mes corto", () => {
    expect(dateChipLabel("2026-09-18", TODAY)).toBe("18 sep");
    expect(dateChipLabel("2026-01-05", TODAY)).toBe("5 ene");
  });

  it("de otro año añade el año", () => {
    expect(dateChipLabel("2025-12-31", TODAY)).toBe("31 dic 2025");
  });

  it("cruza bien el cambio de mes y de año", () => {
    expect(dateChipLabel("2026-08-31", "2026-09-01")).toBe("Ayer");
    expect(dateChipLabel("2025-12-31", "2026-01-01")).toBe("Ayer");
  });

  it("sin fecha válida no inventa una", () => {
    expect(dateChipLabel("", TODAY)).toBe("Fecha");
    expect(dateChipLabel("no-es-fecha", TODAY)).toBe("Fecha");
  });
});
