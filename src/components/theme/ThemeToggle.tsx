"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Evita hydration mismatch: renderiza solo en cliente
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-9 w-9" />;

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "relative flex h-9 w-9 items-center justify-center rounded-lg",
        "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className
      )}
    >
      <Sun
        className={cn(
          "absolute h-5 w-5 transition-all duration-300",
          isDark ? "scale-100 rotate-0 opacity-100" : "scale-0 rotate-90 opacity-0"
        )}
      />
      <Moon
        className={cn(
          "absolute h-5 w-5 transition-all duration-300",
          isDark ? "scale-0 -rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100"
        )}
      />
    </button>
  );
}
