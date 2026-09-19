import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/layout/PageContainer";

export default function Loading() {
  return (
    <PageContainer className="space-y-5">
      <div className="flex items-end justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-44" />
        </div>
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>
      <Skeleton className="h-11 rounded-[18px]" />
      <Skeleton className="h-[152px] rounded-[28px]" />
      <div className="space-y-1.5 rounded-[24px] border border-border p-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 rounded-[18px]" />
        ))}
      </div>
    </PageContainer>
  );
}
