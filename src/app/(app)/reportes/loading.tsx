import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/layout/PageContainer";

/**
 * Skeleton de ruta. Refleja el orden y las alturas de `page.tsx`, tomadas de los
 * propios skeletons de cada pieza: la página es un componente de cliente con
 * `useQuery`, así que este esqueleto se ve durante la navegación y justo después
 * aparece el de cada componente. Si las dos generaciones no miden lo mismo, el salto
 * de layout se ve dos veces.
 */
export default function Loading() {
  return (
    <PageContainer className="space-y-5">
      {/* Cabecera: título de 28px + subtítulo */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-60" />
      </div>

      {/* Pestañas — tres: Extracto, Patrimonio, Presupuestos */}
      <Skeleton className="h-[46px] rounded-[18px]" />

      {/* Selector de mes */}
      <Skeleton className="h-[58px] rounded-[22px]" />

      {/* Filtro de dirección */}
      <Skeleton className="h-[38px] rounded-[16px]" />

      {/* Resumen del extracto — igual que StatementCardSkeleton (una moneda, sin aviso) */}
      <Skeleton className="h-[152px] rounded-[28px]" />

      {/* Tres acciones de exportación — 12 de padding + 3 filas de 64 + separación */}
      <Skeleton className="h-[208px] rounded-[24px]" />

      {/* Vista previa — cuatro filas dentro de la superficie de cristal */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <div className="space-y-1.5 rounded-[24px] border border-border bg-card p-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[62px] rounded-[18px]" />
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
