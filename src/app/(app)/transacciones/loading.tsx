import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/layout/PageContainer";

export default function Loading() {
  return (
    <PageContainer className="space-y-4">
      {/* Título + botón de crear */}
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>

      {/* Selector de mes */}
      <Skeleton className="h-[48px] rounded-[18px]" />

      {/* Buscador */}
      <Skeleton className="h-[44px] rounded-[16px]" />

      {/* Ingresos y gastos del mes */}
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-[84px] rounded-[22px]" />
        <Skeleton className="h-[84px] rounded-[22px]" />
      </div>

      {/* Píldoras de tipo */}
      <Skeleton className="h-[46px] rounded-[18px]" />

      {/* Lista agrupada por día */}
      <div className="space-y-3">
        {[1, 2].map((g) => (
          <div key={g} className="space-y-1.5">
            <Skeleton className="h-3 w-20" />
            <div className="space-y-1.5 rounded-[24px] border border-border p-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 rounded-[18px]" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
