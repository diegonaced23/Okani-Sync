"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton";
import { AvatarCard } from "@/components/perfil/AvatarCard";
import { AccountInfoCard } from "@/components/perfil/AccountInfoCard";
import { CurrencyCard } from "@/components/perfil/CurrencyCard";
import { ThemeCard } from "@/components/perfil/ThemeCard";
import { PasswordCard } from "@/components/perfil/PasswordCard";
import { PushCard } from "@/components/perfil/PushCard";
import { InstallAppCard } from "@/components/perfil/InstallAppCard";
import { NotificationPrefsCard } from "@/components/perfil/NotificationPrefsCard";
import { SessionsCard } from "@/components/perfil/SessionsCard";
import { ExportDataCard } from "@/components/perfil/ExportDataCard";
import { SignOutButton } from "@/components/perfil/SignOutButton";
import { PageContainer } from "@/components/layout/PageContainer";
import { FIELD_LABEL } from "@/lib/ios";

export default function PerfilPage() {
  const me = useQuery(api.users.getMe);

  if (!me) {
    return (
      <PageContainer className="space-y-5">
        <div className="space-y-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-4 w-52" />
        </div>
        <Skeleton className="h-[136px] rounded-[28px]" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-[132px] rounded-[24px]" />)}
      </PageContainer>
    );
  }

  return (
    <PageContainer className="space-y-5">
      <header className="min-w-0">
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-foreground">
          Perfil
        </h1>
        <p className="text-sm text-muted-foreground">Tu cuenta, tus preferencias y tus datos</p>
      </header>

      <AvatarCard me={me} />

      {/* Agrupadas por a qué responden: lo que la app usa para mostrarte cosas, lo que
          te avisa, y lo que protege o se lleva tu cuenta. Antes iban en una sola
          columna separada por dos líneas sueltas. */}
      <section className="space-y-3">
        <span className={FIELD_LABEL}>Preferencias</span>
        <CurrencyCard currency={me.currency ?? "COP"} index={0} />
        <ThemeCard index={1} />
        <InstallAppCard index={2} />
      </section>

      <section className="space-y-3">
        <span className={FIELD_LABEL}>Avisos</span>
        <PushCard index={0} />
        <NotificationPrefsCard prefs={me.notificationPrefs} index={1} />
      </section>

      <section className="space-y-3">
        <span className={FIELD_LABEL}>Seguridad y datos</span>
        <AccountInfoCard me={me} index={0} />
        <PasswordCard email={me.email} index={1} />
        <SessionsCard index={2} />
        <ExportDataCard index={3} />
      </section>

      <SignOutButton />
    </PageContainer>
  );
}
