"use client";

import { useState } from "react";
import { ArrowBigUpDash, Eye, EyeOff, Lock, OctagonX } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Alto y radio comunes a todos los campos de auth: más generosos que el
 *  Input por defecto (h-8), que está pensado para formularios densos. */
export const AUTH_INPUT_CLASS = "h-11 rounded-xl pl-10";

/** Icono decorativo dentro del campo, a la izquierda. */
export function FieldIcon({
  icon: Icon,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  return (
    <Icon
      className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      aria-hidden={true}
    />
  );
}

/**
 * Campo de contraseña con icono, interruptor de visibilidad y aviso de Bloq
 * Mayús. El botón es `type="button"` a propósito: dentro de un <form>, un
 * button sin type envía el formulario.
 */
export function PasswordInput({
  id,
  className,
  onKeyDown,
  onKeyUp,
  onBlur,
  ...props
}: React.ComponentProps<typeof Input>) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  // El estado de Bloq Mayús solo se puede leer de un evento de teclado, así
  // que se refresca en cada tecla y se apaga al salir del campo: fuera de él
  // el aviso no aporta nada y podría quedar desfasado.
  function syncCapsLock(e: React.KeyboardEvent<HTMLInputElement>) {
    setCapsLock(e.getModifierState("CapsLock"));
  }

  return (
    <div>
      <div className="relative">
        <FieldIcon icon={Lock} />
        <Input
          id={id}
          type={visible ? "text" : "password"}
          className={cn(AUTH_INPUT_CLASS, "pr-11", className)}
          onKeyDown={(e) => {
            syncCapsLock(e);
            onKeyDown?.(e);
          }}
          onKeyUp={(e) => {
            syncCapsLock(e);
            onKeyUp?.(e);
          }}
          onBlur={(e) => {
            setCapsLock(false);
            onBlur?.(e);
          }}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={visible}
          aria-controls={id}
          className="touch-hit absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>
      {/* La región existe siempre y solo cambia su contenido: un live region
          que se monta junto con el texto no se anuncia de forma fiable. */}
      <div aria-live="polite">
        {capsLock && (
          <p className="os-enter mt-1.5 flex items-center gap-1.5 text-xs text-warning-text">
            <ArrowBigUpDash className="size-3.5" aria-hidden="true" />
            Bloq Mayús está activado
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Error persistente junto al formulario. Complementa al toast: un toast se
 * auto-descarta y es fácil perdérselo justo cuando el usuario está mirando el
 * teclado. `role="alert"` hace que el lector de pantalla lo anuncie al aparecer.
 */
export function AuthAlert({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="os-enter flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-danger"
    >
      <OctagonX className="mt-px size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
