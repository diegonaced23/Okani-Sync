import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-2xl md:max-w-none mx-auto">
      <div className="md:col-span-2 space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>
      {/* Balance hero */}
      <Skeleton className="h-[170px] rounded-2xl" />
      <Skeleton className="hidden md:block h-[170px] rounded-xl" />
      {/* Quick actions — mobile */}
      <div className="md:hidden grid grid-cols-4 gap-2.5">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[78px] rounded-xl" />)}
      </div>
      {/* Cuentas — carrusel horizontal, visible en todos los tamaños */}
      <div className="md:col-span-2 flex gap-3 overflow-x-hidden">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="flex-none w-[220px] h-[130px] rounded-2xl" />)}
      </div>
      {/* Charts */}
      <Skeleton className="h-56 rounded-xl" />
      <Skeleton className="h-56 rounded-xl" />
      <Skeleton className="md:col-span-2 h-56 rounded-xl" />
      {/* Transacciones recientes */}
      <div className="md:col-span-2 rounded-xl bg-card border border-border p-4 space-y-3">
        {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
      </div>
    </div>
  );
}
