import { describe, expect, it } from "vitest";
import { errorMessage } from "../errorMessage";

const FALLBACK = "No se pudo guardar";

describe("errorMessage", () => {
  it("extrae el mensaje que lanzó la mutation del envoltorio de Convex", () => {
    const err = new Error(
      "[CONVEX M(loans:create)] [Request ID: 3f2a9c] Server Error\nUncaught Error: El monto debe ser mayor que cero\n    at handler (../convex/loans.ts:70:47)\n\n  Called by client",
    );
    expect(errorMessage(err, FALLBACK)).toBe("El monto debe ser mayor que cero");
  });

  it("usa el respaldo cuando producción oculta el mensaje", () => {
    const err = new Error("[CONVEX M(loans:create)] [Request ID: 3f2a9c] Server Error\n  Called by client");
    expect(errorMessage(err, FALLBACK)).toBe(FALLBACK);
  });

  it("no muestra errores del validador de argumentos", () => {
    const err = new Error("ArgumentValidationError: Value does not match validator.\nPath: .amount");
    expect(errorMessage(err, FALLBACK)).toBe(FALLBACK);
  });

  it("respeta un mensaje propio del cliente", () => {
    expect(errorMessage(new Error("La foto no puede pesar más de 2 MB"), FALLBACK)).toBe("La foto no puede pesar más de 2 MB");
  });

  it("usa el respaldo con valores que no son errores", () => {
    expect(errorMessage(undefined, FALLBACK)).toBe(FALLBACK);
    expect(errorMessage({ code: 500 }, FALLBACK)).toBe(FALLBACK);
    expect(errorMessage(new Error(""), FALLBACK)).toBe(FALLBACK);
  });
});
