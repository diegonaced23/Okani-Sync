import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold">
          <span className="text-accent">Okany</span>
          <span className="text-foreground"> Sync</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Gestión de finanzas personales
        </p>
      </div>
      <SignIn />
    </main>
  );
}
