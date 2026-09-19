import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthAlert } from "@/components/auth/AuthFields";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Restablecer contraseña" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <AuthShell
      title="Define tu contraseña"
      subtitle="Elige una contraseña para tu cuenta de Okany Sync"
    >
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="space-y-4">
          <AuthAlert>
            El enlace está incompleto o ya no es válido. Los enlaces caducan y solo
            se pueden usar una vez.
          </AuthAlert>
          <Button
            render={<Link href="/forgot-password" />}
            size="lg"
            className="h-11 w-full rounded-xl font-semibold"
          >
            Pedir un enlace nuevo
          </Button>
          <Button
            render={<Link href="/login" />}
            variant="outline"
            size="lg"
            className="h-11 w-full rounded-xl"
          >
            Volver al inicio de sesión
          </Button>
        </div>
      )}
    </AuthShell>
  );
}
