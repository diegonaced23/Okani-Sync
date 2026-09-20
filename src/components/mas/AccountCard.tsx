"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronRight, LogOut } from "lucide-react";
import { UserAvatar, clearCachedAvatar } from "@/components/layout/UserAvatar";
import { authClient } from "@/lib/auth-client";
import { EASE_OUT_EXPO, haptic } from "@/lib/ios";
import { cn } from "@/lib/utils";

/**
 * La cuenta, arriba del hub.
 *
 * Antes el acceso a `/perfil` era una fila anónima al final, presentada como si fuera
 * un módulo más y repitiendo el enlace que el menú de la foto ya ofrece en la cabecera
 * de la misma pantalla. Aquí es lo que es: tu cuenta, con tu cara y tu correo. Copia
 * la cápsula que la barra lateral usa en escritorio, para que las dos plataformas
 * digan lo mismo.
 */
export function AccountCard({ name, email }: { name?: string; email?: string }) {
  const router = useRouter();
  const reduce = useReducedMotion();

  async function handleSignOut() {
    haptic();
    await authClient.signOut();
    clearCachedAvatar();
    router.push("/login");
    router.refresh();
  }

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
      className="os-glass-well p-1.5"
      aria-label="Tu cuenta"
    >
      <div className="flex items-center gap-2">
        <Link
          href="/perfil"
          onClick={() => haptic()}
          className={cn(
            "touch-hit flex min-w-0 flex-1 items-center gap-3 rounded-[16px] p-1.5 transition-colors",
            "active:bg-foreground/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <UserAvatar className="h-11 w-11 shrink-0 rounded-[14px] text-[15px] font-extrabold" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-bold leading-tight text-foreground">
              {name || "Usuario"}
            </span>
            <span className="block truncate text-xs text-muted-foreground">{email}</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />
        </Link>
      </div>

      {/* Sin fila de apariencia: el interruptor de tema ya está en la cabecera en
          móvil y en la barra lateral en escritorio, siempre a la vista. */}
      <div aria-hidden="true" className="os-hairline mx-3 my-1.5" />

      {/* En móvil cerrar sesión solo estaba dentro del menú de la foto. Aquí queda a
          la vista, como en la barra lateral de escritorio. */}
      <button
        type="button"
        onClick={handleSignOut}
        className={cn(
          "touch-hit flex w-full items-center gap-2 rounded-[16px] px-3 py-2.5 text-[14px] font-semibold text-danger transition-colors",
          "active:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        Cerrar sesión
      </button>
    </motion.section>
  );
}
