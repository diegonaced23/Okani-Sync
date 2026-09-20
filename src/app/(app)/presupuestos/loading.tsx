import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/layout/PageContainer";

export default function Loading() {
  return (
    <PageContainer className="space-y-5">
      {/* Título + botón de crear */}
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-44" />
        </div>
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>

      {/* Pestañas */}
      <Skeleton className="h-[46px] rounded-[18px]" />

      {/* Selector de mes */}
      <Skeleton className="h-[48px] rounded-[18px]" />

      {/* Resumen del mes */}
      <Skeleton className="h-[196px] rounded-[28px]" />

      {/* Filas */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <div className="space-y-1.5 rounded-[24px] border border-border p-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[74px] rounded-[18px]" />
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
