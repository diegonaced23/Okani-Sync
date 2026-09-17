import { fromCents } from "./money";

export type TableExport = {
  rows: unknown[];
  count: number;
  truncated: boolean;
};

/**
 * Prepara las filas de una tabla para el archivo de export.
 *
 * Los montos se emiten dos veces: el entero en centavos tal cual está en la BD
 * (fidelidad exacta, es la convención del proyecto) y su valor humano en un
 * campo `<campo>Value`, para que el archivo se pueda leer sin conocer la
 * convención.
 *
 * `truncated` se marca cuando el número de filas alcanzó el tope de lectura,
 * que es la señal de que pudo quedar historia fuera.
 */
export function buildTableExport<T extends Record<string, unknown>>(
  rows: T[],
  limit: number,
  moneyFields: readonly string[]
): TableExport {
  const mapped = rows.map((row) => {
    const out: Record<string, unknown> = { ...row };
    for (const field of moneyFields) {
      const value = row[field];
      if (typeof value === "number") {
        out[`${field}Value`] = fromCents(value);
      }
    }
    return out;
  });

  return {
    rows: mapped,
    count: mapped.length,
    truncated: mapped.length >= limit,
  };
}
