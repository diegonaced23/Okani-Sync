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
  { href: "/dashboard", icon: LayoutDashboard, label: "Inicio" },
  { href: "/transacciones", icon: ArrowLeftRight, label: "Movimientos" },
  { href: "/transacciones?nuevo=true", icon: Plus, label: "Nuevo", isFab: true },
  { href: "/cuentas", icon: Landmark, label: "Cuentas" },
  { href: "/mas", icon: MoreHorizontal, label: "Más" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-surface pb-safe lg:hidden">
      <ul className="flex items-center justify-around px-2">
        {NAV_ITEMS.map((item) => {
          const isActive =
            !item.isFab && (pathname === item.href || pathname.startsWith(item.href + "/"));
          const Icon = item.icon;

          if (item.isFab) {
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-label={item.label}
                  className="flex h-14 w-14 -translate-y-4 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg shadow-accent/30 transition-transform active:scale-95"
                >
                  <Icon className="h-6 w-6" strokeWidth={2.5} />
                </Link>
              </li>
            );
          }

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-3 py-3 text-xs font-medium transition-colors",
                  isActive ? "text-accent" : "text-muted-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5 transition-transform",
                    isActive && "scale-110"
                  )}
                  strokeWidth={isActive ? 2.5 : 1.8}
                />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
