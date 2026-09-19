"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Loader2, Mail, MailCheck, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { AUTH_INPUT_CLASS, AuthAlert, FieldIcon } from "./AuthFields";
import { authErrorMessage } from "./authErrors";
import { takeHandoffEmail } from "./emailHandoff";

/** Espera antes de permitir reenviar: evita que un doble clic impaciente
 *  dispare varios correos y choque con el rate limit de Better Auth. */
const RESEND_COOLDOWN_SECONDS = 60;

export function ForgotPasswordForm() {
  const reduceMotion = useReducedMotion();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const sentHeadingRef = useRef<HTMLHeadingElement>(null);

  // El correo que venía escrito en /login. Se lee tras montar y no en el
  // estado inicial: sessionStorage no existe en el servidor, y un valor
  // distinto en el primer render del cliente rompería la hidratación.
  useEffect(() => {
    const handoff = takeHandoffEmail();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lectura única al montar que además borra el valor: useSyncExternalStore exige una lectura pura
    if (handoff) setEmail((current) => current || handoff);
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Al cambiar de vista el foco se quedaría en un botón que ya no existe; se
  // lleva al título para que el lector de pantalla anuncie el nuevo estado.
  useEffect(() => {
    if (sentTo) sentHeadingRef.current?.focus();
  }, [sentTo]);

  async function sendLink(target: string) {
    setError(null);
    setLoading(true);
    const { error: resetError } = await authClient.requestPasswordReset({
      email: target,
      redirectTo: "/reset-password",
    });
    setLoading(false);

    if (resetError) {
      setError(authErrorMessage(resetError, "No se pudo enviar el correo. Inténtalo de nuevo."));
      return;
    }

    setSentTo(target);
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    await sendLink(email.trim());
  }

  if (sentTo) {
    return (
      <div className="space-y-5 text-center">
        <motion.span
          className="mx-auto grid size-14 place-items-center rounded-2xl bg-lime/15 text-lime-text"
          initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", bounce: 0.45, duration: 0.6 }}
          aria-hidden="true"
        >
          <MailCheck className="size-7" />
        </motion.span>

        <div className="space-y-2">
          <h2
            ref={sentHeadingRef}
            tabIndex={-1}
            className="text-lg font-semibold focus-visible:outline-none"
          >
            Revisa tu correo
          </h2>
          {/* Better Auth responde lo mismo exista o no el correo, para no
              filtrar qué cuentas hay registradas — el texto es igual de
              ambiguo. */}
          <p className="text-sm text-muted-foreground">
            Si <span className="font-medium break-all text-foreground">{sentTo}</span>{" "}
            tiene cuenta, te enviamos un enlace para definir una nueva contraseña. Revisa
            también la carpeta de spam.
          </p>
        </div>

        {error && <AuthAlert>{error}</AuthAlert>}

        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={loading || cooldown > 0}
            onClick={() => sendLink(sentTo)}
            className="h-11 w-full gap-2 rounded-xl"
          >
            {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {loading
              ? "Enviando…"
              : cooldown > 0
                ? `Reenviar en ${cooldown} s`
                : "Reenviar enlace"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            disabled={loading}
            onClick={() => {
              setSentTo(null);
              setError(null);
            }}
            className="h-11 w-full rounded-xl"
          >
            Usar otro correo
          </Button>
        </div>

        <BackToLogin />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-busy={loading}>
      <p className="text-sm text-muted-foreground">
        Escribe el correo de tu cuenta y te enviaremos un enlace para crear una contraseña
        nueva.
      </p>

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
            disabled={loading}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
            className={AUTH_INPUT_CLASS}
          />
        </div>
      </div>

      {error && <AuthAlert>{error}</AuthAlert>}

      <Button
        type="submit"
        size="lg"
        disabled={loading}
        className="h-11 w-full gap-2 rounded-xl font-semibold"
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Send className="size-4" aria-hidden="true" />
        )}
        {loading ? "Enviando…" : "Enviar enlace"}
      </Button>

      <BackToLogin />
    </form>
  );
}

function BackToLogin() {
  return (
    <div className="flex justify-center">
      <Link
        href="/login"
        className="touch-hit inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver al inicio de sesión
      </Link>
    </div>
  );
}
