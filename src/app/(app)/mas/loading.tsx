import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/layout/PageContainer";

export default function Loading() {
  return (
    <PageContainer className="space-y-6">
      <Skeleton className="h-7 w-16" />
      <div className="space-y-4">
        <Skeleton className="h-3 w-20" />
        <div className="rounded-xl bg-card border border-border overflow-hidden divide-y divide-border">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-[60px] rounded-none" />
          ))}
        </div>
      </div>
      <div className="space-y-4">
        <Skeleton className="h-3 w-16" />
        <div className="rounded-xl bg-card border border-border overflow-hidden">
          <Skeleton className="h-[60px] rounded-none" />
        </div>
      </div>
    </PageContainer>
  );
}
