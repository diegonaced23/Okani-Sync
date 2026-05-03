"use client";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import {
  CreditCard, HandCoins, Tags, PieChart, BarChart3,
  User, ChevronRight, Repeat,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";

const MAIN_LINKS = [
  { href: "/tarjetas",   icon: CreditCard,  label: "Tarjetas de crédito", desc: "Cuotas e interés compuesto" },
  { href: "/deudas",       icon: HandCoins, label: "Deudas",                    desc: "Préstamos y abonos" },
  { href: "/recurrentes", icon: Repeat,    label: "Movimientos recurrentes", desc: "Gastos automáticos cada mes" },
  { href: "/categorias", icon: Tags,        label: "Categorías",           desc: "Organiza tus movimientos" },
  { href: "/presupuestos",icon: PieChart,   label: "Presupuestos",         desc: "Control por categoría y mes" },
  { href: "/reportes",   icon: BarChart3,   label: "Reportes",             desc: "Exportar CSV y PDF" },
];

const ACCOUNT_LINKS = [
  { href: "/perfil",     icon: User,        label: "Mi perfil",            desc: "Nombre, moneda, tema, sesiones" },
];

export default function MasPage() {
  const { user } = useUser();
  const isAdmin = user?.publicMetadata?.role === "admin";

  if (isAdmin) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground">Más</h1>
        <section className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-2">
            Cuenta
          </p>
          <div className="rounded-xl bg-card border border-border overflow-hidden">
            <ul className="divide-y divide-border">
              {ACCOUNT_LINKS.map(({ href, icon: Icon, label, desc }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="flex items-center gap-4 px-4 py-3.5 hover:bg-muted/50 transition-colors"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{label}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
        <p className="text-center text-xs text-muted-foreground pb-2">
          Okany Sync · v0.1.0
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground">Más</h1>

      {/* Módulos principales */}
      <section className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-2">
          Módulos
        </p>
        <div className="rounded-xl bg-card border border-border overflow-hidden">
          <ul className="divide-y divide-border">
            {MAIN_LINKS.map(({ href, icon: Icon, label, desc }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="flex items-center gap-4 px-4 py-3.5 hover:bg-muted/50 transition-colors"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <Separator />

      {/* Cuenta y configuración */}
      <section className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-2">
          Cuenta
        </p>
        <div className="rounded-xl bg-card border border-border overflow-hidden">
          <ul className="divide-y divide-border">
            {ACCOUNT_LINKS.map(({ href, icon: Icon, label, desc }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="flex items-center gap-4 px-4 py-3.5 hover:bg-muted/50 transition-colors"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Versión */}
      <p className="text-center text-xs text-muted-foreground pb-2">
        Okany Sync · v0.1.0
      </p>
    </div>
  );
}
