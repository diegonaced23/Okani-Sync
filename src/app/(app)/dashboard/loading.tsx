import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton de ruta. Debe reflejar el ORDEN y las alturas de `page.tsx`: si se
 * desalinea, cada entrada al dashboard produce un salto de layout (CLS).
 */
export default function Loading() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-2xl md:max-w-none mx-auto">
      {/* Saludo */}
      <div className="md:col-span-2 space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>

      {/* Balance hero + Mes en curso */}
      <Skeleton className="h-[170px] rounded-2xl" />
      <Skeleton className="hidden md:block h-[170px] rounded-xl" />

      {/* Quick actions — mobile */}
      <div className="md:hidden grid grid-cols-4 gap-2.5">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[78px] rounded-xl" />)}
      </div>

      {/* Mes en curso — mobile (dos mini-tarjetas) */}
      <div className="md:hidden grid grid-cols-2 gap-3">
        <Skeleton className="h-[72px] rounded-xl" />
        <Skeleton className="h-[72px] rounded-xl" />
      </div>

      {/* Mis cuentas — carrusel horizontal */}
      <div className="md:col-span-2 flex gap-3 overflow-x-hidden">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="flex-none w-[220px] h-[130px] rounded-2xl" />)}
      </div>

      {/* Próximos 30 días */}
      <Skeleton className="md:col-span-2 h-48 rounded-xl" />

      {/* Evolución del patrimonio */}
      <Skeleton className="md:col-span-2 h-60 rounded-xl" />

      {/* Desglose del gasto (h-72, con pestañas) + tendencia 6 meses (h-56) */}
      <Skeleton className="h-72 rounded-xl" />
      <Skeleton className="h-56 rounded-xl" />

      {/* Salud financiera — 3 KPIs; el último ocupa el ancho en móvil */}
      <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-2.5 [&>*:last-child]:col-span-2 md:[&>*:last-child]:col-span-1">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>

      {/* Ahorro del mes + Metas */}
      <Skeleton className="h-56 rounded-xl" />
      <Skeleton className="h-56 rounded-xl" />

      {/* Últimos movimientos + Presupuestos */}
      <div className="rounded-xl bg-card border border-border p-4 space-y-3">
        {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
      </div>
      <div className="rounded-xl bg-card border border-border p-4 space-y-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
      </div>
    </div>
  );
}
