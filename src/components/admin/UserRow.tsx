"use client";

import Link from "next/link";
import { ChevronRight, ShieldCheck } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { activityStatus, formatStatCount } from "@/lib/adminHealth";
import { formatRelative } from "@/lib/utils";
import { tint } from "@/lib/ios";

export type AdminUser = FunctionReturnType<typeof api.users.listForAdmin>[number];

/**
 * Formatea el conteo de movimientos sin mentir en ninguno de los dos sentidos:
 *
 * - Sin conteo no hay fila de `userStats` todavía (nadie ha corrido el
 *   recálculo desde que este usuario existe): mostrar "0" sería afirmar un
 *   conteo exacto que en realidad nunca se calculó.
 * - El tope se aplica con `formatStatCount`, compartido con `UserUsageCard` y
 *   `VolumeCard`. Esta fila tenía su propia copia y era la única equivocada:
 *   miraba `statsCapped` a secas, y `capped` se enciende si CUALQUIERA de las
 *   quince tablas del usuario topó, así que alguien con 3 movimientos y 10 000
 *   cuotas salía como «10.000+ movimientos».
 */
function formatMovementCount(user: AdminUser): string {
  const n = user.transactionCount;
  if (n === undefined) return "sin calcular";
  return `${formatStatCount(n, user.statsCapped)} movimiento${n === 1 ? "" : "s"}`;
}

/**
 * Fila de un usuario en la lista del panel admin. Toda la fila navega a la
 * ficha: no hay botones internos que capturen el clic.
 */
export function UserRow({ user, now }: { user: AdminUser; now: number }) {
  // Solo "dormant" se pinta en magenta. "unknown" —nunca entró y sin
  // contadores— no se colorea: el texto de la fila ya dice «nunca ha entrado ·
  // sin calcular», que es la verdad; teñirlo afirmaría una inactividad que
  // nadie ha comprobado.
  const dormant = activityStatus(user.lastSeenAt, user.transactionCount, now) === "dormant";
  const initials = (user.name || user.email).trim().slice(0, 1).toUpperCase() || "?";
  const isAdmin = user.role === "admin";

  return (
    <Link
      href={`/admin/users/${user.clerkId}`}
      className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
    >
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold"
        style={{
          background: tint(isAdmin ? "var(--os-violet)" : "var(--muted-foreground)", 18),
          // El texto usa la variante `-text` del token, no el token base: en
          // modo claro `--os-violet` (L=0.65) no llega al contraste 4.5:1
          // sobre su propio fondo teñido (ver comentario de `--os-violet-text`
          // en globals.css). Mismo patrón que TransactionFilters.tsx.
          color: isAdmin ? "var(--os-violet-text)" : "var(--muted-foreground)",
        }}
      >
        {initials}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-[14px] font-semibold text-foreground">
            {user.name || user.email}
          </p>
          {/* "Desactivada" no se trunca nunca: si algo cede espacio, es el
              nombre, no el aviso de que esta cuenta no puede entrar. */}
          {!user.active && (
            <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Desactivada
            </span>
          )}
        </div>
        <p className="truncate text-[12px] text-muted-foreground">{user.email}</p>

        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
          <span
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold"
            style={isAdmin ? { background: tint("var(--os-violet)", 16), color: "var(--os-violet-text)" } : undefined}
          >
            {isAdmin && <ShieldCheck className="h-3 w-3" aria-hidden="true" />}
            {isAdmin ? "Admin" : "Usuario"}
          </span>
          <span aria-hidden="true">·</span>
          {/* `lastSeenAt` sin definir se dice tal cual: inventar una fecha (la
              de alta, por ejemplo) sería afirmar una visita que nunca ocurrió. */}
          <span style={dormant ? { color: "var(--os-magenta)" } : undefined}>
            {user.lastSeenAt === undefined ? "nunca ha entrado" : formatRelative(user.lastSeenAt)}
          </span>
          <span aria-hidden="true">·</span>
          <span>{formatMovementCount(user)}</span>
        </div>
      </div>

      <ChevronRight aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
