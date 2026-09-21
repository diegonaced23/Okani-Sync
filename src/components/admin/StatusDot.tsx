import type { HealthStatus } from "@/lib/adminHealth";

/**
 * Color semántico del estado. `--success` no existe en `globals.css` (solo
 * `--danger`, `--warning`, `--info`), así que «ok» usa el lima de marca
 * (`--os-lime`) a propósito, sin inventar un segundo verde solo para separar
 * «bien» del acento visual: verde ya significa «bien» para cualquiera sin
 * pensarlo, y lo que hace que un problema salte a la vista es que naranja y
 * rojo no se parecen al lima, no que «ok» tenga un tono distinto de marca.
 */
export const STATUS_TONE: Record<HealthStatus, string> = {
  ok: "var(--os-lime)",
  late: "var(--warning)",
  failed: "var(--danger)",
  unknown: "var(--muted-foreground)",
};

/**
 * Variante para textos largos sobre fondo claro u oscuro.
 *
 * `STATUS_TONE` está pensado para un punto de color y una etiqueta de dos
 * palabras; `--os-lime` y `--warning` son demasiado luminosos para una frase
 * entera sobre fondo claro (por debajo de 4.5:1). `globals.css` ya define las
 * variantes `-text` justo para este caso, así que se reutilizan en vez de
 * inventar colores nuevos. Vive aquí, junto a `STATUS_TONE`, para que los
 * colores de estado tengan un único dueño.
 */
export const STATUS_TEXT_TONE: Record<HealthStatus, string> = {
  ok: "var(--os-lime-text)",
  late: "var(--warning-text)",
  failed: "var(--danger)",
  unknown: "var(--muted-foreground)",
};

const LABEL: Record<HealthStatus, string> = {
  ok: "Al día",
  late: "Atrasado",
  failed: "Falló",
  unknown: "Sin datos",
};

export function StatusDot({ status }: { status: HealthStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold"
          style={{ color: STATUS_TONE[status] }}>
      <span aria-hidden="true" className="h-2 w-2 rounded-full"
            style={{ background: STATUS_TONE[status] }} />
      {LABEL[status]}
    </span>
  );
}
