// Texto de la ficha de fecha de los formularios de movimiento: casi siempre es
// hoy, así que se dice con palabras; el resto, con día y mes corto.

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DAY_MS = 86_400_000;

/** "YYYY-MM-DD" a días desde la época, en UTC para que el horario de verano no mueva el conteo */
function dayNumber(dateStr: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  const ts = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return Number.isNaN(ts) ? null : Math.round(ts / DAY_MS);
}

/**
 * @param dateStr fecha elegida, "YYYY-MM-DD"
 * @param today   hoy en hora local, "YYYY-MM-DD" (todayStr())
 */
export function dateChipLabel(dateStr: string, today: string): string {
  const d = dayNumber(dateStr);
  const t = dayNumber(today);
  if (d === null || t === null) return "Fecha";

  const diff = d - t;
  if (diff === 0) return "Hoy";
  if (diff === -1) return "Ayer";
  if (diff === 1) return "Mañana";

  const [y, mo, day] = dateStr.split("-").map(Number);
  const base = `${day} ${MONTHS[mo - 1]}`;
  return y === Number(today.slice(0, 4)) ? base : `${base} ${y}`;
}
