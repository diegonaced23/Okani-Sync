"use client";

import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { KeyRound, Loader2, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { AUDIT_ACTIONS } from "@/lib/constants";
import { SESSIONS_CHANGED_EVENT } from "@/lib/sessionEvents";
import { FIELD_LABEL, haptic } from "@/lib/ios";
import { SettingsCard } from "./SettingsCard";

const MIN_LENGTH = 8;

export function PasswordCard({ email, index }: { email: string; index?: number }) {
  const logSelfAudit = useMutation(api.users.logSelfAudit);
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelado = false;
    authClient
      .listAccounts()
      .then(({ data }) => {
        if (cancelado) return;
        // Los usuarios que vienen de la migración entraron por magic link y no
        // tienen cuenta `credential`: para ellos changePassword fallaría con
        // CREDENTIAL_ACCOUNT_NOT_FOUND. Ver docs/migracion-better-auth.md.
        setHasPassword((data ?? []).some((a) => a.providerId === "credential"));
      })
      .catch(() => {
        if (cancelado) return;
        // El cliente de better-auth solo resuelve `{ error }` para fallos de la
        // API; un fallo de red real (sin conexión, etc.) rechaza la promesa. Si
        // eso pasa no sabemos si el usuario tiene contraseña, así que se asume
        // que no la tiene: eso deja disponible el flujo de "crear/definir
        // contraseña" por correo, que funciona igual si ya tenía una (equivale
        // a "olvidé mi contraseña"). Asumir lo contrario (`true`) sería peor,
        // porque ese formulario exige la contraseña actual y dejaría al
        // usuario sin ninguna forma de avanzar.
        setHasPassword(false);
        toast.error("No se pudo verificar el estado de tu contraseña. Intenta de nuevo más tarde.");
      });
    return () => { cancelado = true; };
  }, []);

  async function handleChange(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < MIN_LENGTH) {
      toast.error(`La contraseña debe tener al menos ${MIN_LENGTH} caracteres`);
      return;
    }
    if (next !== confirm) {
      toast.error("Las contraseñas no coinciden");
      return;
    }
    if (next === current) {
      toast.error("La contraseña nueva debe ser distinta de la actual");
      return;
    }

    setLoading(true);
    try {
      // Importante: NO se usa la bandera `revokeOtherSessions` de changePassword.
      // Pese al nombre, su implementación borra TODAS las sesiones (incluida la
      // actual) y crea una nueva con token nuevo, dejando obsoleto el token que
      // useSession() tiene en memoria. El endpoint dedicado sí preserva la sesión
      // actual filtrándola por token.
      const { error } = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
      });
      if (error) {
        toast.error(
          error.code === "INVALID_PASSWORD"
            ? "La contraseña actual no es correcta"
            : (error.message ?? "No se pudo cambiar la contraseña")
        );
        return;
      }

      // A partir de aquí la contraseña YA cambió en el servidor: un fallo en lo
      // que sigue (revocar otras sesiones, auditar) no es un fallo del cambio de
      // contraseña y no debe reportarse como tal.
      let otherSessionsRevoked = false;
      try {
        const { error: revokeError } = await authClient.revokeOtherSessions();
        otherSessionsRevoked = !revokeError;
      } catch {
        otherSessionsRevoked = false;
      }

      if (otherSessionsRevoked) {
        window.dispatchEvent(new CustomEvent(SESSIONS_CHANGED_EVENT));
      }

      try {
        await logSelfAudit({ action: AUDIT_ACTIONS.USER_PASSWORD_CHANGED });
      } catch {
        // La auditoría es best-effort: no tiene sentido alarmar al usuario ni
        // revertir un cambio de contraseña que ya se aplicó.
      }

      setCurrent(""); setNext(""); setConfirm("");
      if (otherSessionsRevoked) {
        toast.success("Contraseña actualizada. Se cerraron tus otras sesiones.");
      } else {
        toast.success("Contraseña actualizada.");
        toast.warning("No se pudieron cerrar tus otras sesiones. Puedes cerrarlas manualmente más abajo.");
      }
    } catch {
      toast.error("No se pudo cambiar la contraseña. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    haptic();
    setLoading(true);
    try {
      const { error } = await authClient.requestPasswordReset({
        email,
        redirectTo: "/reset-password",
      });
      if (error) {
        toast.error(error.message ?? "No se pudo enviar el correo");
        return;
      }
      toast.success("Te enviamos un correo para definir tu contraseña");
    } catch {
      toast.error("No se pudo enviar el correo. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  if (hasPassword === null) {
    // Medida sobre el caso con contraseña: padding 32 + cabecera 32 + margen 14 +
    // tres campos de 56 + la nota 21 + separaciones 36 + botón 44 + pie 37. El caso
    // «crear contraseña» es bastante más corto y el esqueleto no puede medir los dos,
    // pero es el menos frecuente: solo lo ven las cuentas que aún entran por enlace.
    return <Skeleton className="h-[384px] rounded-[24px]" />;
  }

  const submitLabel = loading ? "Guardando…" : "Cambiar contraseña";

  return (
    <SettingsCard
      icon={Lock}
      tone="var(--os-violet)"
      title="Contraseña"
      index={index}
      description={
        hasPassword
          ? undefined
          : "Entras con enlace mágico. Puedes definir una contraseña para iniciar sesión sin esperar el correo cada vez."
      }
      footnote={hasPassword ? "Al cambiarla se cerrarán tus sesiones en los otros dispositivos." : undefined}
    >
      {hasPassword ? (
        <form onSubmit={handleChange} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="current-password" className={FIELD_LABEL}>Contraseña actual</Label>
            <Input id="current-password" type="password" autoComplete="current-password"
              required value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password" className={FIELD_LABEL}>Contraseña nueva</Label>
            <Input id="new-password" type="password" autoComplete="new-password"
              required minLength={MIN_LENGTH} value={next}
              onChange={(e) => setNext(e.target.value)} />
            <p className="px-1 text-[11px] text-muted-foreground">
              Mínimo {MIN_LENGTH} caracteres.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password" className={FIELD_LABEL}>Confirmar contraseña nueva</Label>
            <Input id="confirm-password" type="password" autoComplete="new-password"
              required minLength={MIN_LENGTH} value={confirm}
              onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="touch-hit flex h-11 w-full items-center justify-center gap-2 rounded-[16px] bg-gradient-to-r from-violet-400 to-indigo-500 text-[14px] font-bold text-white shadow-[0_8px_20px_-10px_rgb(129_140_248/0.8)] transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {loading
              ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              : <KeyRound className="h-4 w-4" aria-hidden="true" />}
            {submitLabel}
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={handleCreate}
          disabled={loading}
          className="touch-hit flex h-11 w-full items-center justify-center gap-2 rounded-[16px] bg-gradient-to-r from-violet-400 to-indigo-500 text-[14px] font-bold text-white shadow-[0_8px_20px_-10px_rgb(129_140_248/0.8)] transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            : <KeyRound className="h-4 w-4" aria-hidden="true" />}
          {loading ? "Enviando…" : "Crear contraseña"}
        </button>
      )}
    </SettingsCard>
  );
}
