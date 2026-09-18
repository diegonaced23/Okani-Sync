"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogIn, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { AUTH_INPUT_CLASS, AuthAlert, FieldIcon, PasswordInput } from "./AuthFields";
import { authErrorMessage } from "./authErrors";

export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  // Estado propio: si compartiera `loading` con el submit, pedir el enlace de
  // recuperación dejaría el botón de entrar deshabilitado y al revés.
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = loading || resetLoading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    setError(null);
    setLoading(true);
    const { error: signInError } = await authClient.signIn.email({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setLoading(false);
      // El correo se conserva: reescribirlo es la parte tediosa de reintentar.
      setPassword("");
      setError(authErrorMessage(signInError, "No se pudo iniciar sesión. Inténtalo de nuevo."));
      return;
    }

    // Sin setLoading(false): la navegación desmonta el formulario y apagar el
    // spinner antes dejaría el botón "listo" mientras la página aún cambia.
    router.push("/");
    router.refresh();
  }

  async function handleForgotPassword() {
    if (busy) return;

    if (!email.trim()) {
      setError("Escribe tu correo y volvemos a enviarte el enlace.");
      return;
    }

    setError(null);
    setResetLoading(true);
    const { error: resetError } = await authClient.requestPasswordReset({
      email: email.trim(),
      redirectTo: "/reset-password",
    });
    setResetLoading(false);

    if (resetError) {
      setError(authErrorMessage(resetError, "No se pudo enviar el correo. Inténtalo de nuevo."));
      return;
    }

    // Better Auth responde lo mismo exista o no el correo, para no filtrar qué
    // cuentas hay registradas — el mensaje se mantiene igual de ambiguo.
    toast.success("Si ese correo tiene cuenta, te llega un enlace en un momento.", {
      description: "Revisa también la carpeta de spam.",
    });
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
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="password">Contraseña</Label>
          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={busy}
            className="touch-hit inline-flex items-center gap-1.5 text-xs font-medium text-lime-text transition-opacity hover:underline disabled:opacity-50"
          >
            {resetLoading && (
              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            )}
            {resetLoading ? "Enviando…" : "¿Olvidaste tu contraseña?"}
          </button>
        </div>
        <PasswordInput
          id="password"
          autoComplete="current-password"
          required
          disabled={busy}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {error && <AuthAlert>{error}</AuthAlert>}

      <Button
        type="submit"
        size="lg"
        disabled={busy}
        className="h-11 w-full gap-2 rounded-xl font-semibold"
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <LogIn className="size-4" aria-hidden="true" />
        )}
        {loading ? "Entrando…" : "Iniciar sesión"}
      </Button>
    </form>
  );
}
