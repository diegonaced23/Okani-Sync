"use client";

import { UserButton } from "@clerk/nextjs";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import Link from "next/link";

interface HeaderProps {
  title?: string;
}

export function Header({ title }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-border bg-background/80 px-4 backdrop-blur-sm lg:hidden">
      <Link href="/dashboard" className="flex items-center gap-1.5 mr-auto">
        <span className="text-lg font-bold text-accent">Okany</span>
        {title && (
          <span className="text-sm text-muted-foreground">/ {title}</span>
        )}
      </Link>

      <ThemeToggle />
      <NotificationBell />

      <UserButton
        appearance={{
          elements: { avatarBox: "h-8 w-8" },
        }}
      />
    </header>
  );
}
