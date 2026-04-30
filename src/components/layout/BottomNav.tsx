"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Plus,
  Landmark,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard",     icon: LayoutDashboard, label: "Inicio" },
  { href: "/transacciones", icon: ArrowLeftRight,  label: "Movimientos" },
  { href: "/transacciones?nuevo=true", icon: Plus, label: "Nuevo", isFab: true },
  { href: "/cuentas",       icon: Landmark,        label: "Cuentas" },
  { href: "/mas",           icon: MoreHorizontal,  label: "Más" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegación inferior"
      className="fixed bottom-0 left-0 right-0 z-50 lg:hidden pb-safe"
      style={{ padding: "8px 14px 14px", background: "linear-gradient(to bottom, transparent 0%, var(--background) 35%)", pointerEvents: "none" }}
    >
      <ul
        className="flex items-center justify-around"
        style={{
          pointerEvents: "auto",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 28,
          padding: "8px 6px",
          boxShadow: "var(--shadow-md)",
          position: "relative",
        }}
      >
        {NAV_ITEMS.map((item) => {
          const isActive =
            !item.isFab && (pathname === item.href || pathname.startsWith(item.href.split("?")[0] + "/"));
          const Icon = item.icon;

          if (item.isFab) {
            return (
              <li key={item.href} className="flex items-center justify-center" style={{ flex: "0 0 auto" }}>
                <Link
                  href={item.href}
                  aria-label={item.label}
                  className="pulse-ring flex items-center justify-center"
                  style={{
                    width: 54, height: 54,
                    borderRadius: 9999,
                    background: "linear-gradient(135deg, var(--os-lime), var(--os-cyan))",
                    color: "var(--primary-foreground)",
                    transform: "translateY(-16px)",
                    border: "4px solid var(--background)",
                    transition: "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-20px) rotate(8deg)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-16px)"; }}
                >
                  <Icon className="h-6 w-6" strokeWidth={2.5} />
                </Link>
              </li>
            );
          }

          return (
            <li key={item.href} style={{ flex: 1 }}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-1.5 text-[10px] font-semibold transition-colors",
                  isActive ? "text-foreground" : "text-muted-foreground"
                )}
              >
                <span
                  className="flex items-center justify-center transition-colors"
                  style={{
                    width: 36, height: 26, borderRadius: 13,
                    background: isActive ? "var(--surface-2)" : "transparent",
                    transition: "background 0.25s var(--ease-out-expo)",
                  }}
                >
                  <Icon
                    className={cn("h-[18px] w-[18px] transition-transform", isActive && "scale-105")}
                    strokeWidth={isActive ? 2.5 : 1.8}
                  />
                </span>
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
