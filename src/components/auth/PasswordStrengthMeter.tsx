"use client";

import { Check } from "lucide-react";
import type { PasswordStrength } from "@/lib/passwordStrength";
import { cn } from "@/lib/utils";

const LEVELS = [
  { label: "", bar: "" },
  { label: "Débil", bar: "bg-danger" },
  { label: "Aceptable", bar: "bg-warning" },
  { label: "Buena", bar: "bg-lime" },
  { label: "Fuerte", bar: "bg-lime" },
] as const;

/**
 * Barra de cuatro segmentos y checklist de reglas. Solo la longitud bloquea el
 * envío (ver src/lib/passwordStrength.ts); el resto orienta sin exigir. Cada
 * regla lleva su estado en texto para lector de pantalla: el check por sí solo
 * es decorativo.
 */
export function PasswordStrengthMeter({
  id,
  strength,
}: {
  id: string;
  strength: PasswordStrength;
}) {
  const level = LEVELS[strength.score];

  return (
    <div id={id} className="space-y-2 pt-1">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" aria-hidden="true">
          {[1, 2, 3, 4].map((segment) => (
            <span
              key={segment}
              className={cn(
                "h-1 flex-1 rounded-full bg-muted transition-colors duration-300",
                strength.score >= segment && level.bar
              )}
            />
          ))}
        </div>
        <span className="w-16 text-right text-xs font-medium text-muted-foreground">
          {level.label && <span className="sr-only">Seguridad: </span>}
          {level.label}
        </span>
      </div>

      <ul className="grid gap-x-3 gap-y-1 min-[400px]:grid-cols-2">
        {strength.rules.map((rule) => (
          <li
            key={rule.id}
            className={cn(
              "flex items-center gap-1.5 text-xs transition-colors",
              rule.met ? "text-lime-text" : "text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "grid size-3.5 shrink-0 place-items-center rounded-full border transition-all duration-300",
                rule.met ? "scale-100 border-transparent bg-lime/20" : "scale-90 border-border"
              )}
              aria-hidden="true"
            >
              <Check
                className={cn(
                  "size-2.5 transition-opacity duration-300",
                  rule.met ? "opacity-100" : "opacity-0"
                )}
              />
            </span>
            {rule.label}
            <span className="sr-only">{rule.met ? " (cumplido)" : " (pendiente)"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
