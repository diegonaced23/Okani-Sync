"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Landmark,
  CreditCard,
  HandCoins,
  Tags,
  PieChart,
  BarChart3,
  User,
  ShieldCheck,
} from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

const NAV_SECTIONS = [
  {
    label: "Principal",
    items: [
      { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
      { href: "/transacciones", icon: ArrowLeftRight, label: "Transacciones" },
      { href: "/cuentas", icon: Landmark, label: "Cuentas" },
      { href: "/tarjetas", icon: CreditCard, label: "Tarjetas" },
      { href: "/deudas", icon: HandCoins, label: "Deudas" },
    ],
  },
  {
    label: "Organización",
    items: [
      { href: "/categorias", icon: Tags, label: "Categorías" },
      { href: "/presupuestos", icon: PieChart, label: "Presupuestos" },
      { href: "/reportes", icon: BarChart3, label: "Reportes" },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useUser();
  const isAdmin = user?.publicMetadata?.role === "admin";

  return (
    <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-border bg-surface">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 px-6 border-b border-border">
        <span className="text-xl font-bold text-accent">Okany</span>
        <span className="text-xl font-light text-foreground">Sync</span>
      </div>

      {/* Navegación */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-accent/15 text-accent"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <Icon
                        className="h-4 w-4 shrink-0"
                        strokeWidth={isActive ? 2.5 : 1.8}
                      />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer del sidebar */}
      <div className="border-t border-border px-3 py-3 space-y-0.5">
        {isAdmin && (
          <Link
            href="/admin"
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              pathname.startsWith("/admin")
                ? "bg-accent/15 text-accent"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <ShieldCheck className="h-4 w-4 shrink-0" />
            Administración
          </Link>
        )}
        <Link
          href="/perfil"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            pathname === "/perfil"
              ? "bg-accent/15 text-accent"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <User className="h-4 w-4 shrink-0" />
          Perfil
        </Link>
        <div className="flex items-center justify-between px-3 py-1">
          <span className="text-xs text-muted-foreground truncate max-w-[160px]">
            {user?.emailAddresses[0]?.emailAddress}
          </span>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
