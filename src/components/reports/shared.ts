import type { Doc } from "../../../convex/_generated/dataModel";
import { signOf } from "@/components/transactions/shared";
import type { LedgerMaps } from "@/lib/reports";

// Utilidades de estilo iOS compartidas con los demás módulos (viven en src/lib/ios.ts)
export { EASE_OUT_EXPO, GLASS_SURFACE, FIELD_LABEL, SPRING, haptic, tint } from "@/lib/ios";
// Aritmética de meses de los horizontes configurables (vive en src/lib/money.ts)
export { monthsEndingAt } from "@/lib/money";

export type Transaction = Doc<"transactions">;

/**
 * Filtro del extracto por dirección de caja.
 *
 * Es la lectura que corresponde a un extracto —lo que entró y salió de verdad—, no
 * el gasto devengado del dashboard. El filtro anterior era `type === "gasto"`, que
 * dejaba fuera los gastos con tarjeta: el usuario pedía «solo gastos» y no veía la
 * mitad de los suyos.
 */
export type StatementFilter = "todos" | "entradas" | "salidas";

export const STATEMENT_FILTERS: { key: StatementFilter; label: string }[] = [
  { key: "todos",    label: "Todos" },
  { key: "entradas", label: "Entradas" },
  { key: "salidas",  label: "Salidas" },
];

export function matchesFilter(tx: Pick<Transaction, "type">, filter: StatementFilter): boolean {
  if (filter === "todos") return true;
  const sign = signOf(tx);
  return filter === "entradas" ? sign === "+" : sign === "−";
}

/** Categoría con lo que la fila necesita para pintarse: nombre, emoji y color. */
export interface CategoryInfo {
  name: string;
  icon: string;
  color: string;
}

export interface ReportMaps {
  categories: Record<string, CategoryInfo>;
  accounts: Record<string, string>;
  cards: Record<string, { name: string; lastFourDigits: string }>;
  /** La misma información con la forma que espera `generateFullLedgerCsv` */
  ledger: LedgerMaps;
}

/**
 * Índices de categorías, cuentas y tarjetas para la vista previa y las exportaciones.
 *
 * La pantalla construía un mapa solo con los nombres de categoría, así que las filas
 * salían sin emoji ni color y las transferencias decían «Transferencia» en vez de
 * «origen → destino», aunque las cuentas y las tarjetas ya estaban cargadas en la
 * misma página para el libro contable.
 */
export function buildReportMaps(
  categories: Doc<"categories">[] | undefined,
  accounts: { _id: string; name: string }[] | undefined,
  cards: { _id: string; name: string; lastFourDigits: string }[] | undefined,
): ReportMaps {
  const categoryEntries = (categories ?? []).map(
    (c) => [c._id as string, { name: c.name, icon: c.icon, color: c.color }] as const,
  );
  const categoryMap = Object.fromEntries(categoryEntries);
  const accountMap = Object.fromEntries((accounts ?? []).map((a) => [a._id, a.name]));
  const cardMap = Object.fromEntries(
    (cards ?? []).map((c) => [c._id, { name: c.name, lastFourDigits: c.lastFourDigits }]),
  );

  return {
    categories: categoryMap,
    accounts: accountMap,
    cards: cardMap,
    ledger: {
      accounts: accountMap,
      cards: Object.fromEntries(
        (cards ?? []).map((c) => [c._id, { name: c.name, lastFour: c.lastFourDigits }]),
      ),
      cats: Object.fromEntries(categoryEntries.map(([id, cat]) => [id, cat.name])),
    },
  };
}
