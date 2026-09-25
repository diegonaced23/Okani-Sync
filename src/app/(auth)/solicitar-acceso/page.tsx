import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { authNextJs } from "@/lib/auth-server";
import { AuthShell } from "@/components/auth/AuthShell";
import { RequestAccessForm } from "@/components/auth/RequestAccessForm";

export const metadata: Metadata = { title: "Solicitar acceso" };

export default async function RequestAccessPage() {
  // Mismo predicado que /login y que (app)/layout.tsx: quien ya entró no tiene
  // nada que solicitar.
  if (await authNextJs.isAuthenticated()) redirect("/dashboard");

  return (
    <AuthShell
      title="Solicitar acceso"
      subtitle="Cuéntanos quién eres y por qué quieres usar la app"
      footer={
        <>
          ¿Ya tienes cuenta?{" "}
          <a href="/login" className="font-medium text-lime-text hover:underline">
            Inicia sesión
          </a>
        </>
      }
    >
      <RequestAccessForm />
    </AuthShell>
  );
}
