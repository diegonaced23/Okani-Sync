import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { authNextJs } from "@/lib/auth-server";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignInForm } from "@/components/auth/SignInForm";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default async function SignInPage() {
  // Quien ya tiene sesión no ve el formulario. La comprobación es exactamente
  // la misma que usa src/app/(app)/layout.tsx para echar a quien no la tiene:
  // al compartir predicado, el par no puede rebotar. Por eso no vive en el
  // proxy, que solo mira si la cookie existe y con una vencida haría bucle.
  //
  // El destino es /dashboard y NO "/": src/app/page.tsx manda a /login cuando
  // getMe devuelve null, y eso pasa de forma legítima con un invitado que
  // acaba de llegar por magic link — su fila de `users` todavía no existe,
  // porque la crea ensureExists desde AuthGuard. Con "/" ese usuario quedaría
  // rebotando entre / y /login justo en su primer acceso. Desde /dashboard,
  // AuthGuard resuelve el alta y, si algo falla, muestra una pantalla con
  // salida. Un admin recibe un replace a /admin desde el propio AuthGuard.
  if (await authNextJs.isAuthenticated()) redirect("/dashboard");

  return (
    <AuthShell
      title={
        <>
          <span className="text-lime-text">Okany</span>
          <span className="text-foreground"> Sync</span>
        </>
      }
      subtitle="Gestión de finanzas personales"
      footer={
        <>
          El acceso es solo por invitación.{" "}
          <a href="/solicitar-acceso" className="font-medium text-lime-text hover:underline">
            Solicita acceso
          </a>
          .
        </>
      }
    >
      <SignInForm />
    </AuthShell>
  );
}
