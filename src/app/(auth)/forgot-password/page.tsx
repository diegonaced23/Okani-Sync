import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Recupera tu acceso"
      subtitle="Te ayudamos a definir una nueva contraseña"
      footer="Si nunca has entrado a Okany Sync, el enlace no te llegará: pide acceso a tu administrador."
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
