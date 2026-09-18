import { cn } from "@/lib/utils";

/**
 * Contenedor de ancho estándar para las páginas de la app.
 *
 * - `narrow` (por defecto): listas, detalles y formularios. Una columna legible.
 * - `wide`: paneles con grilla (dashboard, admin).
 *
 * En móvil ambos ocupan todo el ancho disponible; el tope solo aplica en
 * pantallas grandes. Las clases de espaciado/grilla van en `className`.
 */
const WIDTHS = {
  narrow: "max-w-2xl",
  wide: "max-w-5xl",
} as const;

interface PageContainerProps extends React.ComponentProps<"div"> {
  variant?: keyof typeof WIDTHS;
}

export function PageContainer({
  variant = "narrow",
  className,
  ...props
}: PageContainerProps) {
  return <div className={cn("mx-auto w-full", WIDTHS[variant], className)} {...props} />;
}
