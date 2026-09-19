"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { PASSWORD_MIN_LENGTH, passwordStrength } from "@/lib/passwordStrength";
import { toast } from "sonner";
import { AuthAlert, PasswordInput } from "./AuthFields";
import { PasswordStrengthMeter } from "./PasswordStrengthMeter";
import { SuccessCheck } from "./SuccessCheck";
import { authErrorMessage } from "./authErrors";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = passwordStrength(password);
  // Solo se avisa del desajuste cuando ya escribió algo en la confirmación: si
  // no, el error aparece en la primera tecla y acusa a alguien que va bien.
  const mismatch = confirm.length > 0 && password !== confirm;
  const busy = loading || success;
  const canSubmit = strength.valid && confirm.length > 0 && !mismatch && !busy;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setError(null);
    setLoading(true);
    const { error: resetError } = await authClient.resetPassword({
      newPassword: password,
      token,
    });

    if (resetError) {
      setLoading(false);
      setError(
        authErrorMessage(
          resetError,
          "El enlace expiró o ya fue usado. Pide uno nuevo desde «¿Olvidaste tu contraseña?»."
        )
      );
      return;
    }

    const { data: session } = await authClient.getSession();
    setLoading(false);
    setSuccess(true);
    toast.success("Contraseña definida", {
      description: "Ya puedes entrar con tu correo y tu nueva contraseña.",
    });
    router.push(session ? "/" : "/login");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-busy={busy}>
      <div className="space-y-1.5">
        <Label htmlFor="password">Nueva contraseña</Label>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          autoFocus
          required
          minLength={PASSWORD_MIN_LENGTH}
          disabled={busy}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby="password-strength"
        />
        <PasswordStrengthMeter id="password-strength" strength={strength} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirmar contraseña</Label>
        <PasswordInput
          id="confirm"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          disabled={busy}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={mismatch}
        />
      </div>

      {mismatch && <AuthAlert>Las contraseñas no coinciden.</AuthAlert>}
      {error && <AuthAlert>{error}</AuthAlert>}

      <Button
        type="submit"
        size="lg"
        disabled={!canSubmit}
        className="h-11 w-full gap-2 rounded-xl font-semibold"
      >
        {success ? (
          <SuccessCheck />
        ) : loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <KeyRound className="size-4" aria-hidden="true" />
        )}
        {success ? "¡Contraseña lista!" : loading ? "Guardando…" : "Definir contraseña"}
      </Button>
    </form>
  );
}
