"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Plus,
  Wallet,
  MoreHorizontal,
  Users,
  User,
} from "lucide-react";
import { useQuery } from "convex/react";
import { motion, useReducedMotion } from "framer-motion";
import { api } from "../../../convex/_generated/api";
import { cn } from "@/lib/utils";
import { useNewTransactionModal } from "@/contexts/new-transaction-modal";

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
  isFab?: boolean;
  matchPaths?: string[];
}

const USER_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard",     icon: LayoutDashboard, label: "Inicio" },
  { href: "/transacciones", icon: ArrowLeftRight,  label: "Movimientos" },
  { href: "#",              icon: Plus,            label: "Nuevo", isFab: true },
  { href: "/productos", icon: Wallet, label: "Productos", matchPaths: ["/cuentas", "/tarjetas"] },
  { href: "/mas",           icon: MoreHorizontal,  label: "Más" },
];

const ADMIN_NAV_ITEMS: NavItem[] = [
  { href: "/admin",       icon: LayoutDashboard, label: "Panel" },
  { href: "/admin/users", icon: Users,           label: "Usuarios" },
  { href: "/perfil",      icon: User,            label: "Perfil" },
];

function isItemActive(pathname: string, item: NavItem) {
  if (item.isFab) return false;
  const matches = (p: string) => pathname === p || pathname.startsWith(p + "/");
  return matches(item.href) || (item.matchPaths?.some(matches) ?? false);
}

export function BottomNav() {
  const pathname = usePathname();
  const me = useQuery(api.users.getMe);
  const isAdmin = me?.role === "admin";
  const navItems = isAdmin ? ADMIN_NAV_ITEMS : USER_NAV_ITEMS;
  const { openModal } = useNewTransactionModal();
  const reduceMotion = useReducedMotion();

  // "/admin" es prefijo de "/admin/users": gana la ruta más específica para que
  // la píldora activa marque un único item.
  const activeHref = navItems
    .filter((item) => isItemActive(pathname, item))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  // Mismo muelle que la píldora del Sidebar.
  const pillTransition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 420, damping: 34, mass: 0.8 };

  return (
    <nav
      aria-label="Navegación inferior"
      className="fixed bottom-0 left-0 right-0 z-50 lg:hidden"
      // El inset inferior se suma aquí: un padding inline anularía la clase .pb-safe.
      // El velo es suave a propósito: un fondo opaco dejaría al vidrio sin nada que refractar.
      style={{
        padding: "10px 14px calc(12px + env(safe-area-inset-bottom, 0px))",
        background: "linear-gradient(to bottom, transparent 0%, color-mix(in oklch, var(--background) 55%, transparent) 70%)",
        pointerEvents: "none",
      }}
    >
      <ul
        className="os-liquid-glass relative flex items-center gap-0.5 rounded-full p-1.5"
        style={{ pointerEvents: "auto" }}
      >
        {navItems.map((item) => {
          const Icon = item.icon;

          if (item.isFab) {
            return (
              <li key={item.label} className="flex shrink-0 items-center justify-center px-1">
                <button
                  type="button"
                  aria-label={item.label}
                  onClick={() => openModal()}
                  className="os-gel-button grid h-12 w-12 place-items-center rounded-full text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <Icon className="h-[22px] w-[22px]" strokeWidth={2.6} />
                </button>
              </li>
            );
          }

          const isActive = item.href === activeHref;
          return (
            <li key={item.href} className="min-w-0 flex-1">
              <Link
                href={item.href}
                prefetch={true}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative flex h-[52px] flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-semibold",
                  "transition-[color,transform] duration-150 active:scale-95",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {isActive && (
                  <motion.span
                    aria-hidden
                    layoutId="bottomnav-active-pill"
                    transition={pillTransition}
                    className="os-glass-pill absolute inset-0 rounded-full"
                  />
                )}
                <Icon
                  className="relative h-[19px] w-[19px]"
                  strokeWidth={isActive ? 2.4 : 1.8}
                  style={isActive ? { color: "var(--os-lime-text)" } : undefined}
                />
                <span className="relative max-w-full truncate px-1">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
