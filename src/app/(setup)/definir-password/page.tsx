import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { SetInitialPasswordForm } from "@/components/auth/SetInitialPasswordForm";

export const metadata: Metadata = { title: "Define tu contraseña" };

export default function SetInitialPasswordPage() {
  return (
    <AuthShell
      title="Define tu contraseña"
      subtitle="Un último paso antes de entrar"
    >
      <SetInitialPasswordForm />
    </AuthShell>
  );
}
