"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, ArrowLeftRight, Landmark, CreditCard,
  HandCoins, Tags, PieChart, BarChart3, User, Users, Repeat,
} from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

const USER_NAV_SECTIONS = [
  {
    label: "Principal",
    items: [
      { href: "/dashboard",     icon: LayoutDashboard, label: "Dashboard",      prefetch: true },
      { href: "/transacciones", icon: ArrowLeftRight,  label: "Transacciones",  prefetch: true },
      { href: "/cuentas",       icon: Landmark,        label: "Cuentas",        prefetch: true },
      { href: "/tarjetas",      icon: CreditCard,      label: "Tarjetas",       prefetch: true },
      { href: "/deudas",        icon: HandCoins,       label: "Deudas",         prefetch: true },
      { href: "/recurrentes",   icon: Repeat,          label: "Recurrentes",    prefetch: true },
    ],
  },
  {
    label: "Organización",
    items: [
      { href: "/categorias",   icon: Tags,      label: "Categorías"  },
      { href: "/presupuestos", icon: PieChart,  label: "Presupuestos" },
      { href: "/reportes",     icon: BarChart3, label: "Reportes"    },
    ],
  },
];

const ADMIN_NAV_SECTIONS = [
  {
    label: "Administración",
    items: [
      { href: "/admin",       icon: LayoutDashboard, label: "Dashboard" },
      { href: "/admin/users", icon: Users,           label: "Usuarios" },
    ],
  },
];

const BrandLogo = () => (
  <span
    aria-hidden
    style={{
      width: 30, height: 30, borderRadius: 10,
      background: "linear-gradient(135deg, var(--os-lime), var(--os-cyan))",
      display: "grid", placeItems: "center",
      color: "var(--primary-foreground)",
      boxShadow: "0 4px 14px -2px color-mix(in oklch, var(--os-lime) 45%, transparent)",
      flexShrink: 0,
    }}
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 14c0-5 4-9 8-9s8 4 8 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="12" cy="17" r="2.5" fill="currentColor" />
    </svg>
  </span>
);

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useUser();
  const isAdmin = user?.publicMetadata?.role === "admin";
  const initials = user?.firstName?.charAt(0).toUpperCase() ?? "U";

  return (
    <aside
      className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0"
      style={{ background: "var(--surface)", borderRight: "1px solid var(--border)" }}
    >
      {/* Marca */}
      <div
        className="flex h-16 items-center gap-2.5 px-5"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <BrandLogo />
        <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.025em" }}>
          Okany<span style={{ opacity: 0.4, fontWeight: 500 }}>·sync</span>
        </span>
      </div>

      {/* Navegación */}
      <nav aria-label="Navegación principal" className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
        {(isAdmin ? ADMIN_NAV_SECTIONS : USER_NAV_SECTIONS).map((section) => (
          <div key={section.label}>
            <p
              className="px-3 mb-1 mt-3"
              style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted-foreground)" }}
            >
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      prefetch={"prefetch" in item ? item.prefetch : undefined}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors",
                        isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                      )}
                      style={isActive ? {
                        background: "linear-gradient(135deg, color-mix(in oklch, var(--os-lime) 22%, transparent), color-mix(in oklch, var(--os-cyan) 14%, transparent))",
                        border: "1px solid color-mix(in oklch, var(--os-lime) 28%, transparent)",
                      } : undefined}
                    >
                      <Icon className="h-4 w-4 shrink-0" strokeWidth={isActive ? 2.5 : 1.8} />
                      <span style={{ flex: 1 }}>{item.label}</span>
                      {isActive && (
                        <span style={{ width: 6, height: 6, borderRadius: 9999, background: "var(--os-lime)", flexShrink: 0 }} />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "10px 12px" }} className="space-y-0.5">
        <Link
          href="/perfil"
          aria-current={pathname === "/perfil" ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
            pathname === "/perfil" ? "text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
          )}
        >
          <User className="h-4 w-4 shrink-0" strokeWidth={1.8} />
          Perfil
        </Link>

        {/* Usuario + theme switch */}
        <div className="flex items-center gap-3 px-3 py-2">
          <span
            style={{
              width: 32, height: 32, borderRadius: 10, flexShrink: 0,
              background: "linear-gradient(135deg, var(--os-magenta), oklch(0.32 0.14 20))",
              display: "grid", placeItems: "center",
              color: "white", fontWeight: 800, fontSize: 13,
            }}
          >
            {initials}
          </span>
          <div style={{ flex: 1, minWidth: 0, fontSize: 12 }}>
            <p style={{ fontWeight: 700, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user?.fullName ?? user?.firstName ?? "Usuario"}
            </p>
            <p style={{ color: "var(--muted-foreground)", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user?.emailAddresses[0]?.emailAddress}
            </p>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
