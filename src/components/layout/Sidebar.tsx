"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, ArrowLeftRight, Wallet, PieChart,
  HandCoins, Tags, BarChart3, Users, Repeat, LogOut,
} from "lucide-react";
import { useQuery } from "convex/react";
import { motion, useReducedMotion } from "framer-motion";
import { api } from "../../../convex/_generated/api";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { authClient } from "@/lib/auth-client";
import { UserAvatar, clearCachedAvatar } from "@/components/layout/UserAvatar";
import type { LucideIcon } from "lucide-react";

type NavItem = { href: string; icon: LucideIcon; label: string; prefetch?: boolean; matchPaths?: string[] };
type NavSection = { label: string; items: NavItem[] };

const USER_NAV_SECTIONS: NavSection[] = [
  {
    label: "Principal",
    items: [
      { href: "/dashboard",     icon: LayoutDashboard, label: "Dashboard",            prefetch: true },
      { href: "/transacciones", icon: ArrowLeftRight,  label: "Transacciones",        prefetch: true },
      { href: "/productos",     icon: Wallet,          label: "Mis productos",        prefetch: true, matchPaths: ["/cuentas", "/tarjetas"] },
      { href: "/presupuestos",  icon: PieChart,        label: "Presupuestos y metas", prefetch: true },
    ],
  },
  {
    label: "Organización",
    items: [
      { href: "/deudas", icon: HandCoins, label: "Deudas y préstamos", matchPaths: ["/prestamos"] },
      { href: "/recurrentes", icon: Repeat,    label: "Recurrentes" },
      { href: "/categorias",  icon: Tags,      label: "Categorías"  },
      { href: "/reportes",    icon: BarChart3, label: "Reportes"    },
    ],
  },
];

const ADMIN_NAV_SECTIONS: NavSection[] = [
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

function isItemActive(pathname: string, item: NavItem) {
  const matches = (p: string) => pathname === p || pathname.startsWith(p + "/");
  return matches(item.href) || (item.matchPaths?.some(matches) ?? false);
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const me = useQuery(api.users.getMe);
  const isAdmin = me?.role === "admin";
  const reduceMotion = useReducedMotion();
  const sections = isAdmin ? ADMIN_NAV_SECTIONS : USER_NAV_SECTIONS;
  const profileActive = pathname === "/perfil";

  // "/admin" es prefijo de "/admin/users": gana la ruta más específica para que
  // la píldora activa marque un único item.
  const activeHref = sections
    .flatMap((s) => s.items)
    .filter((item) => isItemActive(pathname, item))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  // Muelle corto al estilo iOS para la píldora que se desliza entre items.
  const pillTransition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 420, damping: 34, mass: 0.8 };

  async function handleSignOut() {
    await authClient.signOut();
    clearCachedAvatar();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="os-liquid-glass fixed rounded-[28px] hidden lg:flex lg:flex-col top-3 bottom-3 left-3 z-40 w-64">
      {/* Marca */}
      <Link
        href={isAdmin ? "/admin" : "/dashboard"}
        aria-label="Okany Sync — Inicio"
        className="flex h-16 shrink-0 items-center gap-2.5 px-5 rounded-t-[28px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <BrandLogo />
        <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.025em" }}>
          Okany<span style={{ opacity: 0.4, fontWeight: 500 }}>·sync</span>
        </span>
      </Link>
      <div aria-hidden className="os-hairline mx-5" />

      {/* Navegación */}
      <nav aria-label="Navegación principal" className="os-sidebar-scroll flex-1 overflow-y-auto px-3 py-2">
        {sections.map((section) => (
          <div key={section.label}>
            <p
              className="px-3 mb-1.5 mt-3"
              style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted-foreground)" }}
            >
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = item.href === activeHref;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      prefetch={item.prefetch}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-[14px] px-3 py-2.5 text-sm font-semibold",
                        "transition-[color,background-color,transform] duration-150 active:scale-[0.98]",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        isActive
                          ? "text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05]"
                      )}
                    >
                      {isActive && (
                        <motion.span
                          aria-hidden
                          layoutId="sidebar-active-pill"
                          transition={pillTransition}
                          className="os-glass-pill absolute inset-0 rounded-[14px]"
                        />
                      )}
                      <Icon
                        className={cn(
                          "relative h-[17px] w-[17px] shrink-0 transition-transform duration-150",
                          !isActive && "group-hover:scale-110"
                        )}
                        strokeWidth={isActive ? 2.4 : 1.8}
                        style={isActive ? { color: "var(--os-lime-text)" } : undefined}
                      />
                      <span className="relative flex-1 truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Cuenta: perfil, tema y cierre de sesión */}
      <div className="shrink-0 p-3">
        <div className="os-glass-well flex items-center gap-2 p-1.5">
          <Link
            href="/perfil"
            aria-current={profileActive ? "page" : undefined}
            aria-label="Perfil"
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2.5 rounded-[14px] p-1.5 transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              profileActive ? "bg-foreground/[0.07]" : "hover:bg-foreground/[0.05]"
            )}
          >
            <UserAvatar className="h-9 w-9 shrink-0 rounded-[12px] text-[13px] font-extrabold" />
            <span className="min-w-0 flex-1 text-xs">
              <span className="block truncate font-bold text-foreground">{me?.name || "Usuario"}</span>
              <span className="block truncate text-[10.5px] text-muted-foreground">{me?.email}</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] text-muted-foreground transition-colors duration-150 hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.9} />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between px-3">
          <span className="text-[11px] font-medium text-muted-foreground">Apariencia</span>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
