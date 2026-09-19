"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, LogIn, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { AUTH_INPUT_CLASS, AuthAlert, FieldIcon, PasswordInput } from "./AuthFields";
import { SuccessCheck } from "./SuccessCheck";
import { authErrorMessage } from "./authErrors";
import { stashHandoffEmail } from "./emailHandoff";

export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = loading || success;

  const trimmedEmail = email.trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    setError(null);
    setLoading(true);
    const { error: signInError } = await authClient.signIn.email({
      email: trimmedEmail,
      password,
    });

    if (signInError) {
      setLoading(false);
      // El correo se conserva: reescribirlo es la parte tediosa de reintentar.
      setPassword("");
      setError(authErrorMessage(signInError, "No se pudo iniciar sesión. Inténtalo de nuevo."));
      return;
    }

    // Sin volver a habilitar el formulario: la navegación lo desmonta, y el
    // check confirma el acceso mientras la página cambia.
    setLoading(false);
    setSuccess(true);
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-busy={busy}>
      <div className="space-y-1.5">
        <Label htmlFor="email">Correo electrónico</Label>
        <div className="relative">
          <FieldIcon icon={Mail} />
          <Input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            required
            disabled={busy}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
            className={AUTH_INPUT_CLASS}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Contraseña</Label>
        <PasswordInput
          id="password"
          autoComplete="current-password"
          required
          disabled={busy}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="flex justify-end">
          {/* El correo ya escrito viaja a /forgot-password para no obligar a
              teclearlo dos veces — por sessionStorage, no por la URL (ver
              emailHandoff.ts). Solo si parece un correo: un texto a medias no
              aporta nada. */}
          <Link
            href="/forgot-password"
            onClick={() => stashHandoffEmail(trimmedEmail.includes("@") ? trimmedEmail : "")}
            className="touch-hit rounded-sm text-xs font-medium text-lime-text hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
      </div>

      {error && <AuthAlert>{error}</AuthAlert>}

      <Button
        type="submit"
        size="lg"
        disabled={busy}
        className="h-11 w-full gap-2 rounded-xl font-semibold"
      >
        {success ? (
          <SuccessCheck />
        ) : loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <LogIn className="size-4" aria-hidden="true" />
        )}
        {success ? "¡Bienvenido!" : loading ? "Entrando…" : "Iniciar sesión"}
      </Button>
    </form>
  );
}
