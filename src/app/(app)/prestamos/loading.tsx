import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
      </div>
    </div>
  );
}
