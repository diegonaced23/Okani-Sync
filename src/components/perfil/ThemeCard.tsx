"use client";

import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useTheme } from "next-themes";
import { Monitor, Sun, Moon } from "lucide-react";

export function ThemeCard() {
  const updateTheme = useMutation(api.users.updateTheme);
  const { theme, setTheme } = useTheme();

  async function handleThemeChange(t: string) {
    setTheme(t);
    try {
      await updateTheme({ theme: t as "light" | "dark" | "system" });
    } catch { /* no mostrar error por preferencia de UI */ }
  }

  return (
    <div className="rounded-xl bg-card border border-border p-4 space-y-3">
      <h2 className="text-sm font-semibold text-foreground">Tema de la aplicación</h2>
      <div role="group" aria-label="Tema de la aplicación" className="grid grid-cols-3 gap-2">
        {[
          { value: "light", label: "Claro", icon: Sun },
          { value: "dark",  label: "Oscuro", icon: Moon },
          { value: "system", label: "Sistema", icon: Monitor },
        ].map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            aria-pressed={theme === value}
            onClick={() => handleThemeChange(value)}
            className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-sm font-medium transition-colors ${
              theme === value
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
