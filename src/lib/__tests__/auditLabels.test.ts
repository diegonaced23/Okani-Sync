import { describe, it, expect } from "vitest";
import { AUDIT_ACTIONS, AUDIT_ACTION_LABELS } from "@/lib/constants";

describe("AUDIT_ACTION_LABELS", () => {
  it("tiene etiqueta para todas las acciones declaradas", () => {
    const sinEtiqueta = Object.values(AUDIT_ACTIONS).filter(
      (accion) => !(accion in AUDIT_ACTION_LABELS),
    );
    expect(sinEtiqueta).toEqual([]);
  });

  it("no define etiquetas para acciones que no existen", () => {
    const acciones = new Set<string>(Object.values(AUDIT_ACTIONS));
    const sobrantes = Object.keys(AUDIT_ACTION_LABELS).filter((k) => !acciones.has(k));
    expect(sobrantes).toEqual([]);
  });
});
