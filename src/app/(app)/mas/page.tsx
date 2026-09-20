"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { motion, useReducedMotion } from "framer-motion";
import {
  BarChart3, HandCoins, PieChart, Repeat, Tags, Users2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { PageContainer } from "@/components/layout/PageContainer";
import { AccountCard } from "@/components/mas/AccountCard";
import { HubRow, type HubBadge } from "@/components/mas/HubRow";
import { EASE_OUT_EXPO, FIELD_LABEL, GLASS_SURFACE } from "@/lib/ios";
import { currentMonth } from "@/lib/money";
import { cn } from "@/lib/utils";

const VERSION = "v0.1.0";

interface HubLink {
  href: string;
  icon: LucideIcon;
  color: string;
  label: string;
  desc: string;
}

const MODULES: HubLink[] = [
  {
    href: "/presupuestos", icon: PieChart, color: "var(--os-lime)",
    label: "Presupuestos y metas",
    desc: "Cuánto puedes gastar y qué estás ahorrando",
  },
  {
    href: "/deudas", icon: HandCoins, color: "var(--os-orange)",
    label: "Deudas y préstamos",
    desc: "Lo que debes y lo que te deben",
  },
  {
    href: "/recurrentes", icon: Repeat, color: "var(--os-cyan)",
    label: "Movimientos recurrentes",
    desc: "Lo que se repite todos los meses",
  },
  {
    href: "/categorias", icon: Tags, color: "var(--os-violet)",
    label: "Categorías",
    desc: "Cómo se organizan tus movimientos",
  },
  {
    href: "/reportes", icon: BarChart3, color: "var(--os-magenta)",
    label: "Reportes",
    desc: "Extracto, patrimonio e histórico de presupuestos",
  },
];

// `/cuentas/compartidas` existía sin que nada en la aplicación enlazara a ella: la
// notificación de invitación guarda un `actionUrl` que ningún componente lee, así que
// te invitaban a una cuenta y no había forma de llegar a aceptarla.
const SHARED: HubLink = {
  href: "/cuentas/compartidas", icon: Users2, color: "var(--os-cyan)",
  label: "Cuentas compartidas",
  desc: "Invitaciones y accesos que compartes",
};

export default function MasPage() {
  const reduce = useReducedMotion();
  // Se fija al montar: leer la fecha del sistema en el render rompería la pureza
  const [month] = useState(() => currentMonth());

  // `getMe` sigue aquí, pero por otro motivo: antes decidía si pintar la rama de
  // administrador —código muerto, porque AuthGuard confina a los admins a /admin y
  // /perfil y ninguna barra de admin enlaza esta página—, y ahora da nombre y correo
  // a la tarjeta de cuenta.
  const me = useQuery(api.users.getMe);
  const budgets = useQuery(api.budgets.overview, { month });
  const debts = useQuery(api.debts.overview, {});
  const invitations = useQuery(api.accountShares.listMyPendingInvitations, {});

  /**
   * Insignias solo donde el número quiere decir «esto pide atención».
   *
   * Recurrentes, categorías y reportes no llevan: no existe una query con forma de
   * contador para ellas, y un «14 categorías» no informaría de nada. Antes de
   * inventar un contador para rellenar el hueco, mejor sin insignia.
   */
  const badges: Record<string, HubBadge | undefined> = {
    "/presupuestos": budgetBadge(budgets),
    "/deudas": debtBadge(debts),
    "/cuentas/compartidas": invitations?.length
      ? {
          count: invitations.length,
          tone: "lime",
          meaning: invitations.length === 1 ? "invitación sin responder" : "invitaciones sin responder",
        }
      : undefined,
  };

  return (
    <PageContainer className="space-y-5">
      <header className="min-w-0">
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-foreground">
          Más
        </h1>
        <p className="text-sm text-muted-foreground">Tu cuenta y el resto de la aplicación</p>
      </header>

      <AccountCard name={me?.name} email={me?.email} />

      <section className="space-y-2">
        <span className={FIELD_LABEL}>Módulos</span>
        <div className={cn("rounded-[24px] p-1.5", GLASS_SURFACE)}>
          <ul className="space-y-0.5">
            {MODULES.map((link, i) => (
              <HubRow key={link.href} {...link} index={i} badge={badges[link.href]} />
            ))}
          </ul>
        </div>
      </section>

      <section className="space-y-2">
        <span className={FIELD_LABEL}>Compartir</span>
        <div className={cn("rounded-[24px] p-1.5", GLASS_SURFACE)}>
          <ul className="space-y-0.5">
            <HubRow {...SHARED} index={MODULES.length} badge={badges[SHARED.href]} />
          </ul>
        </div>
      </section>

      <motion.p
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.35, ease: EASE_OUT_EXPO }}
        className="pb-2 text-center text-xs text-muted-foreground"
      >
        Okany Sync · {VERSION}
      </motion.p>
    </PageContainer>
  );
}

// ─── Insignias ────────────────────────────────────────────────────────────────

type BudgetOverview = { overCount: number; warnCount: number } | undefined;

function budgetBadge(overview: BudgetOverview): HubBadge | undefined {
  if (!overview) return undefined;
  // Un presupuesto excedido pesa más que uno en aviso: si hay alguno, el tono es rojo
  const total = overview.overCount + overview.warnCount;
  if (total === 0) return undefined;
  // El tono ya dice la gravedad; el texto no necesita enumerar los dos casos
  return {
    count: total,
    tone: overview.overCount > 0 ? "danger" : "warning",
    meaning:
      overview.overCount > 0
        ? total === 1 ? "requiere atención" : "requieren atención"
        : "cerca del límite",
  };
}

type DebtOverview = { debtOverdue: number; loanOverdue: number } | undefined;

function debtBadge(overview: DebtOverview): HubBadge | undefined {
  if (!overview) return undefined;
  const { debtOverdue, loanOverdue } = overview;
  const total = debtOverdue + loanOverdue;
  if (total === 0) return undefined;

  // Una deuda es femenina y un préstamo masculino: con los dos mezclados no hay
  // concordancia posible, así que ahí se dice «en mora», que es invariable.
  let meaning: string;
  if (debtOverdue > 0 && loanOverdue > 0) meaning = "en mora";
  else if (debtOverdue > 0) meaning = total === 1 ? "deuda vencida" : "deudas vencidas";
  else meaning = total === 1 ? "préstamo vencido" : "préstamos vencidos";

  return { count: total, tone: "danger", meaning };
}
