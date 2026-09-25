"use client";

import { PageContainer } from "@/components/layout/PageContainer";
import { FIELD_LABEL } from "@/lib/ios";
import { RatesHealthCard } from "@/components/admin/RatesHealthCard";
import { CronsHealthCard } from "@/components/admin/CronsHealthCard";
import { UsersSummaryCard } from "@/components/admin/UsersSummaryCard";
import { PendingInvitationsCard } from "@/components/admin/PendingInvitationsCard";
import { PendingRequestsCard } from "@/components/admin/PendingRequestsCard";
import { DormantUsersCard } from "@/components/admin/DormantUsersCard";
import { VolumeCard } from "@/components/admin/VolumeCard";
import { RecentActivityCard } from "@/components/admin/RecentActivityCard";
import { ManualRateCard } from "@/components/admin/ManualRateCard";

/**
 * Panel de administración.
 *
 * La página es solo composición: cada tarjeta hace su propio `useQuery` y
 * gestiona su propia carga. No se centraliza aquí a propósito — con una sola
 * query compartida, la tarjeta más lenta dejaría en blanco a todas las demás,
 * y la pregunta con la que el admin entra («¿está todo bien?») se responde
 * pieza a pieza, no de golpe.
 *
 * El `index` que recibe cada tarjeta ordena su entrada escalonada; es una
 * numeración continua entre secciones para que el barrido visual siga el orden
 * de lectura y no se reinicie en cada encabezado.
 */
export default function AdminDashboardPage() {
  return (
    <PageContainer variant="wide" className="space-y-7 pb-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Panel administrativo</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Qué está funcionando y quién está usando la app
        </p>
      </div>

      <section className="space-y-2.5">
        <h2 className={FIELD_LABEL}>Estado del sistema</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <RatesHealthCard index={0} />
          <CronsHealthCard index={1} />
        </div>
      </section>

      <section className="space-y-2.5">
        <h2 className={FIELD_LABEL}>Personas</h2>
        <div className="grid grid-cols-1 gap-3">
          <UsersSummaryCard index={2} />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <PendingInvitationsCard index={3} />
            <DormantUsersCard index={4} />
          </div>
          <PendingRequestsCard index={5} />
        </div>
      </section>

      <section className="space-y-2.5">
        <h2 className={FIELD_LABEL}>Uso</h2>
        <VolumeCard index={6} />
      </section>

      <section className="space-y-2.5">
        <h2 className={FIELD_LABEL}>Operación</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <RecentActivityCard index={7} />
          <ManualRateCard index={8} />
        </div>
      </section>
    </PageContainer>
  );
}
