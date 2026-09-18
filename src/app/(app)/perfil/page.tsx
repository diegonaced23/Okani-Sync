"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { AvatarCard } from "@/components/perfil/AvatarCard";
import { AccountInfoCard } from "@/components/perfil/AccountInfoCard";
import { CurrencyCard } from "@/components/perfil/CurrencyCard";
import { ThemeCard } from "@/components/perfil/ThemeCard";
import { PasswordCard } from "@/components/perfil/PasswordCard";
import { PushCard } from "@/components/perfil/PushCard";
import { NotificationPrefsCard } from "@/components/perfil/NotificationPrefsCard";
import { SessionsCard } from "@/components/perfil/SessionsCard";
import { ExportDataCard } from "@/components/perfil/ExportDataCard";
import { SignOutButton } from "@/components/perfil/SignOutButton";
import { PageContainer } from "@/components/layout/PageContainer";

export default function PerfilPage() {
  const me = useQuery(api.users.getMe);

  if (!me) {
    return (
      <PageContainer className="space-y-4">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </PageContainer>
    );
  }

  return (
    <PageContainer className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Perfil</h1>

      <AvatarCard me={me} />
      <AccountInfoCard me={me} />
      <CurrencyCard currency={me?.currency ?? "COP"} />
      <ThemeCard />
      <PasswordCard email={me.email} />
      <PushCard />
      <NotificationPrefsCard prefs={me.notificationPrefs} />

      <Separator />
      <SessionsCard />
      <ExportDataCard />
      <Separator />

      <SignOutButton />
    </PageContainer>
  );
}
