"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PillTabs } from "@/components/ui/pill-tabs";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";

type Mode = "password" | "magic-link";

export function SignInForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("magic-link");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);

    if (mode === "magic-link") {
      const { error } = await authClient.signIn.magicLink({
        email: email.trim(),
        callbackURL: "/",
      });
      setLoading(false);
      if (error) {
        toast.error(error.message ?? "No se pudo enviar el enlace");
        return;
      }
      setLinkSent(true);
      return;
    }

    const { error } = await authClient.signIn.email({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message ?? "Email o contraseña incorrectos");
      return;
    }
    router.push("/");
    router.refresh();
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      toast.error("Escribe tu correo primero");
      return;
    }
    setLoading(true);
    const { error } = await authClient.requestPasswordReset({
      email: email.trim(),
      redirectTo: "/reset-password",
    });
    setLoading(false);
    if (error) {
      toast.error(error.message ?? "No se pudo enviar el correo");
      return;
    }
    toast.success("Revisa tu correo para definir tu contraseña");
  }

  if (linkSent) {
    return (
      <div className="w-full max-w-sm rounded-xl bg-card border border-border p-6 text-center space-y-2">
        <Mail className="h-8 w-8 text-accent mx-auto" />
        <p className="text-sm font-semibold text-foreground">Revisa tu correo</p>
        <p className="text-sm text-muted-foreground">
          Te enviamos un enlace de acceso a <strong>{email}</strong>. Expira pronto y solo funciona una vez.
        </p>
        <Button variant="outline" size="sm" onClick={() => setLinkSent(false)}>
          Usar otro correo
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
      <PillTabs
        ariaLabel="Método de acceso"
        tabs={[
          { key: "magic-link", label: "Enlace mágico" },
          { key: "password", label: "Contraseña" },
        ]}
        active={mode}
        onChange={setMode}
      />

      <div className="space-y-1.5">
        <Label htmlFor="email">Correo electrónico</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@correo.com"
        />
      </div>

      {mode === "password" && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Contraseña</Label>
            <button
              type="button"
              onClick={handleForgotPassword}
              className="text-xs text-accent hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      )}

      <Button type="submit" className="w-full gap-2" disabled={loading}>
        <KeyRound className="h-4 w-4" />
        {loading ? "…" : mode === "magic-link" ? "Enviar enlace" : "Iniciar sesión"}
      </Button>
    </form>
  );
}
