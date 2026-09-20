"use client";

import { useQuery } from "convex/react";
import { UserMenu } from "@/components/layout/UserMenu";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";

interface HeaderProps {
  title?: string;
}

const BrandLogo = () => (
  <span
    aria-hidden
    style={{
      width: 28, height: 28, borderRadius: 9,
      background: "linear-gradient(135deg, var(--os-lime), var(--os-cyan))",
      display: "grid", placeItems: "center",
      color: "var(--primary-foreground)",
      boxShadow: "0 4px 14px -2px color-mix(in oklch, var(--os-lime) 50%, transparent)",
      flexShrink: 0,
    }}
  >
    {/* Mismo glifo que Sidebar.tsx y src/app/icon.svg. Ocupa el chip entero
        porque ya trae su propio margen dentro de la rejilla de 32. */}
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M5.81 20.05A10.35 10.35 0 0 1 23.93 11.6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="16" cy="18.25" r="6.1" stroke="currentColor" strokeWidth="2" />
      <g transform="translate(16 18.25) scale(0.4) translate(-12 -12)">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke="currentColor" strokeWidth="3.7" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  </span>
);

export function Header({ title }: HeaderProps) {
  // El logo llevaba siempre a /dashboard, mientras el de la barra lateral sí mira el
  // rol (Sidebar.tsx). Un administrador que lo tocaba en móvil iba a una ruta que
  // AuthGuard le prohíbe y volvía rebotado a /admin.
  const me = useQuery(api.users.getMe);
  const home = me?.role === "admin" ? "/admin" : "/dashboard";

  return (
    <header className="sticky top-0 z-40 flex h-[calc(58px+env(safe-area-inset-top))] pt-safe items-center gap-3 px-4 lg:hidden"
      style={{ background: "color-mix(in oklch, var(--background) 85%, transparent)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)" }}
    >
      <Link href={home} aria-label="Okany Sync — Inicio" className="touch-hit flex items-center gap-2 mr-auto">
        <BrandLogo />
        <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: "-0.025em", lineHeight: 1 }}>
          Okany<span style={{ opacity: 0.45, fontWeight: 500 }}>·sync</span>
        </span>
        {title && (
          <span className="text-sm text-muted-foreground">/ {title}</span>
        )}
      </Link>

      {/* Notification bell con pip */}
      <div className="relative">
        <NotificationBell />
      </div>

      <ThemeToggle />

      <UserMenu />
    </header>
  );
}
