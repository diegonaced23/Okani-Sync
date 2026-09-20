import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/layout/PageContainer";

/**
 * Skeleton de ruta. `/perfil` no tenía uno, a diferencia del resto: al entrar se veía
 * el layout vacío y luego, ya dentro de la página, el esqueleto propio de `getMe`. Con
 * este archivo las dos generaciones miden lo mismo y el salto desaparece.
 */
export default function Loading() {
  return (
    <PageContainer className="space-y-5">
      {/* Cabecera: título de 28px + subtítulo */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-4 w-52" />
      </div>

      {/* Foto y nombre */}
      <Skeleton className="h-[136px] rounded-[28px]" />

      {/* Los tres grupos: etiqueta + sus tarjetas */}
      {[3, 2, 4].map((cards, group) => (
        <div key={group} className="space-y-3">
          <Skeleton className="h-3 w-24" />
          {Array.from({ length: cards }, (_, i) => (
            <Skeleton key={i} className="h-[132px] rounded-[24px]" />
          ))}
        </div>
      ))}

      <Skeleton className="h-12 rounded-[18px]" />
    </PageContainer>
  );
}
