import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/layout/PageContainer";

/**
 * Skeleton de ruta. Debe reflejar el ORDEN y las alturas de `page.tsx`: si se
 * desalinea, cada entrada al dashboard produce un salto de layout (CLS).
 *
 * Las alturas se tomaron de los propios skeletons de cada tarjeta, no a ojo: la
 * página es un componente de cliente con `useQuery`, así que este esqueleto se ve
 * durante la navegación y justo después aparece el de cada componente. Si las dos
 * generaciones no miden lo mismo, el salto se ve dos veces.
 */
export default function Loading() {
  return (
    <PageContainer variant="wide" className="grid grid-cols-1 gap-5 md:grid-cols-2">
      {/* Saludo + botón de nuevo movimiento */}
      <div className="flex items-end justify-between gap-3 md:col-span-2">
        <div className="space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-44" />
        </div>
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>

      {/* Patrimonio (h-40, igual que el skeleton interno de BalanceCard) */}
      <Skeleton className="h-40 rounded-[22px]" />

      {/* Mes en curso — desktop */}
      <Skeleton className="hidden h-40 rounded-[22px] md:block" />

      {/* Mes en curso — mobile (título + tarjeta de cristal deslizable) */}
      <div className="space-y-2.5 md:hidden">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-[172px] rounded-[24px]" />
      </div>

      {/* Salud financiera */}
      <Skeleton className="h-[210px] rounded-[22px] md:col-span-2" />

      {/* Últimos movimientos — 3 filas de h-11, como el skeleton del componente */}
      <div className="space-y-3 rounded-[22px] border border-border bg-card p-4 md:col-span-2">
        <Skeleton className="h-4 w-40" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-11 rounded-[16px]" />
        ))}
      </div>

      {/* Mis productos — fichas de cuenta y plásticos de tarjeta */}
      <div className="space-y-2 md:col-span-2">
        <Skeleton className="h-4 w-28" />
        <div className="flex gap-3 overflow-x-hidden pt-3 pb-5">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[166px] w-[264px] flex-none rounded-[20px]" />
          ))}
        </div>
      </div>

      {/* Desglose del gasto (h-72, con pestañas) */}
      <Skeleton className="h-72 rounded-[22px] md:col-span-2" />

      {/* Ahorro del mes. Con metas activas pasa a una columna y aparece la lista al
          lado, así que aquí se reserva el caso de una sola columna. */}
      <Skeleton className="h-48 rounded-[22px] md:col-span-2" />

      {/* Presupuestos */}
      <div className="space-y-3 rounded-[22px] border border-border bg-card p-4 md:col-span-2">
        <Skeleton className="h-4 w-36" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 rounded-[16px]" />
        ))}
      </div>
    </PageContainer>
  );
}
