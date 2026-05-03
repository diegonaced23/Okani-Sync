import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6 max-w-2xl mx-auto">
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
    </div>
  );
}
