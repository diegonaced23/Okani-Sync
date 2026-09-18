// Ritmo de gasto del mes en curso: compara qué fracción de los ingresos ya se
// gastó contra qué fracción del mes ya pasó. Lo usa la tarjeta "Mes en curso".

export type PaceStatus =
  | "vacio"        // sin ingresos ni gastos este mes
  | "sin-ingresos" // hay gastos pero ningún ingreso: no hay base para el porcentaje
  | "en-ritmo"     // se gasta al ritmo del mes o más lento
  | "rapido"       // se gasta más rápido de lo que avanza el mes
  | "excedido";    // los gastos ya superan los ingresos

/** Margen sobre el avance del mes antes de considerar que se va rápido (10 puntos). */
export const PACE_TOLERANCE = 0.1;

export interface MonthPace {
  /** Fracción del mes transcurrida, contando el día de hoy (0–1]. */
  elapsed: number;
  /** Fracción de los ingresos ya gastada (puede pasar de 1). 0 sin ingresos. */
  spent: number;
  /** Ingresos − gastos, en centavos. */
  net: number;
  day: number;
  daysInMonth: number;
  status: PaceStatus;
}

export function computeMonthPace(ingresos: number, gastos: number, now: Date = new Date()): MonthPace {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const day = now.getDate();
  const elapsed = day / daysInMonth;
  const spent = ingresos > 0 ? gastos / ingresos : 0;

  let status: PaceStatus;
  if (ingresos <= 0) status = gastos > 0 ? "sin-ingresos" : "vacio";
  else if (spent > 1) status = "excedido";
  else if (spent > elapsed + PACE_TOLERANCE) status = "rapido";
  else status = "en-ritmo";

  return { elapsed, spent, net: ingresos - gastos, day, daysInMonth, status };
}

export const PACE_LABELS: Record<PaceStatus, string> = {
  vacio: "Sin movimientos",
  "sin-ingresos": "Sin ingresos",
  "en-ritmo": "En ritmo",
  rapido: "Vas rápido",
  excedido: "Te pasaste",
};
