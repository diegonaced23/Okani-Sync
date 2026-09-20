import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/layout/PageContainer";

/**
 * Skeleton de ruta. Refleja el orden y las alturas de `page.tsx`: cabecera, cápsula de
 * cuenta y las dos listas. Si no coinciden, cada entrada a la página produce un salto
 * de layout que además se ve dos veces, porque la página es de cliente y detrás llega
 * el estado de carga de sus propias consultas.
 */
export default function Loading() {
  return (
    <PageContainer className="space-y-5">
      {/* Cabecera: título de 28px + subtítulo */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-4 w-56" />
      </div>

      {/* Cápsula de cuenta: padding 12 + fila del avatar 56 + separador 13 + salir 40 */}
      <Skeleton className="h-[121px] rounded-[20px]" />

      {/* Módulos: cinco filas de 64 dentro de la superficie de cristal */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <div className="space-y-0.5 rounded-[24px] border border-border bg-card p-1.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-[64px] rounded-[18px]" />
          ))}
        </div>
      </div>

      {/* Compartir: una sola fila */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <div className="rounded-[24px] border border-border bg-card p-1.5">
          <Skeleton className="h-[64px] rounded-[18px]" />
        </div>
      </div>
    </PageContainer>
  );
}
