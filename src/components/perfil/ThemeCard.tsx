"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { motion } from "framer-motion";
import { api } from "../../../convex/_generated/api";
import { useTheme } from "next-themes";
import { Monitor, Sun, Moon, Palette } from "lucide-react";
import { SPRING, haptic } from "@/lib/ios";
import { cn } from "@/lib/utils";
import { SettingsCard } from "./SettingsCard";

const OPTIONS = [
  { value: "light",  label: "Claro",   icon: Sun },
  { value: "dark",   label: "Oscuro",  icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
] as const;

type ThemeValue = (typeof OPTIONS)[number]["value"];

export function ThemeCard({ index }: { index?: number }) {
  const updateTheme = useMutation(api.users.updateTheme);
  const { theme, setTheme } = useTheme();

  // Antes de hidratar, `theme` es undefined y ninguna opción se veía marcada. El
  // interruptor de la cabecera ya usaba esta guarda; esta tarjeta no.
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  function choose(value: ThemeValue) {
    haptic();
    setTheme(value);
    // La preferencia de interfaz no merece una alerta si falla al guardarse
    updateTheme({ theme: value }).catch(() => {});
  }

  return (
    <SettingsCard
      icon={Palette}
      tone="var(--os-violet)"
      title="Tema de la aplicación"
      index={index}
      footnote="Tu elección se guarda en la cuenta y se aplica en los dispositivos donde todavía no hayas elegido uno."
    >
      {/* Tres opciones excluyentes: es un grupo de radio, no tres interruptores
          independientes, que es lo que decía el `aria-pressed` de antes. */}
      <div
        role="radiogroup"
        aria-label="Tema de la aplicación"
        className="grid grid-cols-3 gap-2"
        onKeyDown={(e) => {
          const current = OPTIONS.findIndex((o) => o.value === theme);
          let next = -1;
          if (e.key === "ArrowRight" || e.key === "ArrowDown") {
            e.preventDefault();
            next = (current + 1) % OPTIONS.length;
          } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
            e.preventDefault();
            next = (current - 1 + OPTIONS.length) % OPTIONS.length;
          }
          if (next !== -1) {
            choose(OPTIONS[next].value);
            (e.currentTarget.querySelectorAll('[role="radio"]')[next] as HTMLElement)?.focus();
          }
        }}
      >
        {OPTIONS.map(({ value, label, icon: Icon }) => {
          const active = mounted && theme === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active || (!mounted && value === "system") ? 0 : -1}
              onClick={() => choose(value)}
              className={cn(
                "touch-hit relative flex flex-col items-center gap-1.5 rounded-[16px] py-3 text-[13px] transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "font-bold text-foreground" : "font-semibold text-muted-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId="perfil-theme-pill"
                  className="absolute inset-0 rounded-[16px] bg-[var(--surface)] shadow-[0_2px_10px_-4px_rgb(0_0_0/0.25)] dark:bg-white/10"
                  transition={SPRING}
                />
              )}
              <Icon className="relative h-4 w-4" aria-hidden="true" strokeWidth={active ? 2.4 : 1.9} />
              <span className="relative">{label}</span>
            </button>
          );
        })}
      </div>
    </SettingsCard>
  );
}
