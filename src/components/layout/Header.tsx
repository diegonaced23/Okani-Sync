"use client";

import { UserButton } from "@clerk/nextjs";
import { Bell } from "lucide-react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import Link from "next/link";

interface HeaderProps {
  title?: string;
}

export function Header({ title }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-border bg-background/80 px-4 backdrop-blur-sm lg:hidden">
      {/* Marca en mobile */}
      <Link href="/dashboard" className="flex items-center gap-1.5 mr-auto">
        <span className="text-lg font-bold text-accent">Okany</span>
        {title && (
          <span className="text-sm text-muted-foreground">/ {title}</span>
        )}
      </Link>

      <ThemeToggle />

      <Link
        href="/notificaciones"
        aria-label="Ver notificaciones"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <Bell className="h-5 w-5" />
      </Link>

      <UserButton
        appearance={{
          elements: {
            avatarBox: "h-8 w-8",
          },
        }}
      />
    </header>
  );
}
