"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Loader2, Mail, MailCheck, MapPin, Send, User, UserPlus } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AUTH_INPUT_CLASS, AuthAlert, FieldIcon } from "./AuthFields";
import { errorMessage } from "@/lib/errorMessage";
import { REGISTRATION_FIELD_LIMITS, REGISTRATION_SOURCES } from "@/lib/constants";
import { validateRegistrationRequest } from "@/lib/registrationRequest";

export function RequestAccessForm() {
  const reduceMotion = useReducedMotion();
  const submit = useMutation(api.registrationRequests.submit);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [source, setSource] = useState("");
  const [referredBy, setReferredBy] = useState("");
  const [note, setNote] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    // La MISMA validación que corre el servidor (src/lib/registrationRequest.ts).
    // Se ejecuta acá solo para dar el error al instante; la que manda es la del
    // servidor, porque esta mutation es pública y nadie puede confiar en lo que
    // diga el navegador.
    const validation = validateRegistrationRequest({
      email, name, city, source, referredBy, note,
    });
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await submit(validation.value);
      setSent(true);
    } catch (err) {
      setError(errorMessage(err, "No pudimos enviar tu solicitud. Inténtalo de nuevo."));
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
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
          <h2 className="text-lg font-semibold">Recibimos tu solicitud</h2>
          {/* Mismo texto pase lo que pase: si dijera algo distinto cuando el
              correo ya tiene cuenta, esta pantalla serviría para averiguar
              quién está registrado. */}
          <p className="text-sm text-muted-foreground">
            Te enviamos un correo de confirmación. Vamos a revisar tu solicitud a mano
            y, si la aprobamos, te llegará tu enlace de acceso.
          </p>
        </div>

        <Link
          href="/login"
          className="touch-hit inline-flex rounded-sm text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Volver al inicio de sesión
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-busy={loading}>
      <div className="space-y-1.5">
        <Label htmlFor="name">Nombre completo</Label>
        <div className="relative">
          <FieldIcon icon={User} />
          <Input
            id="name" autoComplete="name" autoFocus required disabled={loading}
            maxLength={REGISTRATION_FIELD_LIMITS.name}
            value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Ana Pérez" className={AUTH_INPUT_CLASS}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Correo electrónico</Label>
        <div className="relative">
          <FieldIcon icon={Mail} />
          <Input
            id="email" type="email" autoComplete="email" required disabled={loading}
            maxLength={REGISTRATION_FIELD_LIMITS.email}
            value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com" className={AUTH_INPUT_CLASS}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="city">Ciudad</Label>
        <div className="relative">
          <FieldIcon icon={MapPin} />
          <Input
            id="city" autoComplete="address-level2" required disabled={loading}
            maxLength={REGISTRATION_FIELD_LIMITS.city}
            value={city} onChange={(e) => setCity(e.target.value)}
            placeholder="Medellín" className={AUTH_INPUT_CLASS}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="source">¿Cómo conociste la app?</Label>
        <Select
          value={source === "" ? null : source}
          onValueChange={(v) => setSource(v ?? "")}
          disabled={loading}
        >
          <SelectTrigger id="source" className="h-11 w-full rounded-xl">
            {/* El Select es de Base UI: sin children, SelectValue pinta la
                clave cruda ("amigo") en vez de la etiqueta, y con children
                ignora `placeholder`, así que el vacío se pinta aquí. */}
            <SelectValue className="truncate">
              {(v: string | null) =>
                v === null ? (
                  <span className="text-muted-foreground">Elige una opción</span>
                ) : (
                  REGISTRATION_SOURCES.find((s) => s.value === v)?.label ?? v
                )
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {REGISTRATION_SOURCES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="referredBy">
          ¿Quién te refirió? <span className="text-muted-foreground">(opcional)</span>
        </Label>
        <div className="relative">
          <FieldIcon icon={UserPlus} />
          <Input
            id="referredBy" disabled={loading}
            maxLength={REGISTRATION_FIELD_LIMITS.referredBy}
            value={referredBy} onChange={(e) => setReferredBy(e.target.value)}
            placeholder="Nombre de quien te habló de la app"
            className={AUTH_INPUT_CLASS}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="note">¿Por qué quieres usar la app?</Label>
        <Textarea
          id="note" required disabled={loading} rows={4}
          maxLength={REGISTRATION_FIELD_LIMITS.note}
          value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Cuéntanos brevemente en qué te gustaría que te ayude."
          className="rounded-xl"
        />
        <p className="text-right text-xs text-muted-foreground">
          {note.length} / {REGISTRATION_FIELD_LIMITS.note}
        </p>
      </div>

      {error && <AuthAlert>{error}</AuthAlert>}

      <Button
        type="submit" size="lg" disabled={loading}
        className="h-11 w-full gap-2 rounded-xl font-semibold"
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Send className="size-4" aria-hidden="true" />
        )}
        {loading ? "Enviando…" : "Enviar solicitud"}
      </Button>
    </form>
  );
}
