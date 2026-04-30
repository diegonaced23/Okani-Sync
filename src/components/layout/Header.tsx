"use client";

import { UserButton } from "@clerk/nextjs";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import Link from "next/link";

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
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 14c0-5 4-9 8-9s8 4 8 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="12" cy="17" r="2.5" fill="currentColor" />
    </svg>
  </span>
);

export function Header({ title }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 flex h-[58px] items-center gap-3 px-4 lg:hidden"
      style={{ background: "color-mix(in oklch, var(--background) 85%, transparent)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)" }}
    >
      <Link href="/dashboard" aria-label="Okany Sync — Inicio" className="flex items-center gap-2 mr-auto">
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

      <UserButton
        appearance={{
          elements: { avatarBox: "h-8 w-8 rounded-[10px]" },
        }}
      />
    </header>
  );
}
