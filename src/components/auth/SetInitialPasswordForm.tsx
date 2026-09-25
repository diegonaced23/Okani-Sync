"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "convex/react";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AuthAlert, PasswordInput } from "./AuthFields";
import { PasswordStrengthMeter } from "./PasswordStrengthMeter";
import { passwordStrength } from "@/lib/passwordStrength";
import { errorMessage } from "@/lib/errorMessage";

export function SetInitialPasswordForm() {
  const router = useRouter();
  const setInitialPassword = useAction(api.users.setInitialPassword);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = passwordStrength(password);
  const coinciden = confirm === "" || password === confirm;
  const puedeEnviar = strength.valid && password === confirm && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!puedeEnviar) return;

    setError(null);
    setLoading(true);
    try {
      const { alreadyHadPassword } = await setInitialPassword({ newPassword: password });
      if (alreadyHadPassword) {
        // No es un fallo: esta persona ya había definido su contraseña por
        // «¿olvidaste tu contraseña?». El flag ya se limpió, así que puede
        // pasar — pero la que vale es la otra, y hay que decírselo.
        toast.info("Ya tenías una contraseña definida. Entra con esa.");
      } else {
        toast.success("Contraseña definida");
      }
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "No se pudo definir la contraseña. Inténtalo de nuevo."));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-busy={loading}>
      <p className="text-sm text-muted-foreground">
        Entraste con un enlace de acceso. Define una contraseña para poder entrar
        con tu correo a partir de ahora.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="password">Contraseña nueva</Label>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          autoFocus
          required
          disabled={loading}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby="fuerza"
        />
        <PasswordStrengthMeter id="fuerza" strength={strength} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm">Repite la contraseña</Label>
        <PasswordInput
          id="confirm"
          autoComplete="new-password"
          required
          disabled={loading}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {!coinciden && (
          <p className="text-xs text-danger" role="alert">
            Las contraseñas no coinciden.
          </p>
        )}
      </div>

      {error && <AuthAlert>{error}</AuthAlert>}

      <Button
        type="submit"
        size="lg"
        disabled={!puedeEnviar}
        className="h-11 w-full gap-2 rounded-xl font-semibold"
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <KeyRound className="size-4" aria-hidden="true" />
        )}
        {loading ? "Guardando…" : "Guardar y entrar"}
      </Button>
    </form>
  );
}
