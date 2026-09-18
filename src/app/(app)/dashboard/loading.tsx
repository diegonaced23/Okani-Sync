import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/layout/PageContainer";

/**
 * Skeleton de ruta. Debe reflejar el ORDEN y las alturas de `page.tsx`: si se
 * desalinea, cada entrada al dashboard produce un salto de layout (CLS).
 */
export default function Loading() {
  return (
    <PageContainer variant="wide" className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {/* Saludo */}
      <div className="md:col-span-2 space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>

      {/* Balance hero + Mes en curso */}
      <Skeleton className="h-[170px] rounded-2xl" />
      <Skeleton className="hidden md:block h-[170px] rounded-xl" />

      {/* Mes en curso — mobile (título + tarjeta de cristal) */}
      <div className="md:hidden space-y-2.5">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-[172px] rounded-[24px]" />
      </div>

      {/* Últimos movimientos */}
      <div className="md:col-span-2 rounded-xl bg-card border border-border p-4 space-y-3">
        {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
      </div>

      {/* Mis productos — cuentas (fichas) + tarjetas (plásticos) */}
      <div className="md:col-span-2 space-y-2">
        <Skeleton className="h-4 w-28" />
        <div className="flex gap-3 overflow-x-hidden pt-3 pb-5">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="flex-none w-[264px] h-[166px] rounded-[20px]" />)}
        </div>
      </div>

      {/* Desglose del gasto (h-72, con pestañas) */}
      <Skeleton className="md:col-span-2 h-72 rounded-xl" />

      {/* Ahorro del mes (Metas solo aparece si hay metas activas) */}
      <Skeleton className="md:col-span-2 h-56 rounded-xl" />

      {/* Presupuestos */}
      <div className="md:col-span-2 rounded-xl bg-card border border-border p-4 space-y-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
      </div>
    </PageContainer>
  );
}
