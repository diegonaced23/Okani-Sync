import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/layout/PageContainer";

export default function Loading() {
  return (
    <PageContainer className="space-y-5">
      {/* Título + acciones */}
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-10 w-10 rounded-full" />
        </div>
      </div>

      {/* Pestañas */}
      <Skeleton className="h-[46px] rounded-[18px]" />

      {/* Resumen */}
      <Skeleton className="h-[168px] rounded-[28px]" />

      {/* Grupo de cuentas */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <div className="space-y-1.5 rounded-[24px] border border-border p-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-[18px]" />
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
