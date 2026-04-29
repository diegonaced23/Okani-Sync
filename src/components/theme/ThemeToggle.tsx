"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div style={{ width: 56, height: 30 }} />;

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn("relative flex-shrink-0 overflow-hidden", className)}
      style={{
        width: 56, height: 30, borderRadius: 9999,
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        cursor: "pointer",
      }}
    >
      {/* Micro-estrellas en dark */}
      {isDark && (
        <span aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {([{ t: 7, l: 8 }, { t: 15, l: 14 }, { t: 9, l: 20 }, { t: 19, l: 6 }]).map((s, i) => (
            <span key={i} style={{
              position: "absolute", top: s.t, left: s.l,
              width: 2, height: 2, borderRadius: 9999,
              background: "var(--foreground)", opacity: 0.55,
            }} />
          ))}
        </span>
      )}
      {/* Knob deslizable */}
      <span
        aria-hidden
        style={{
          position: "absolute", top: 3,
          left: isDark ? 31 : 3,
          width: 22, height: 22,
          borderRadius: 9999,
          display: "grid", placeItems: "center",
          color: "white",
          background: isDark
            ? "linear-gradient(135deg, var(--os-violet), var(--os-cyan))"
            : "linear-gradient(135deg, var(--os-orange-2), var(--os-orange))",
          boxShadow: "0 2px 6px -1px oklch(0.18 0.02 260 / 0.3)",
          transition: "left 0.42s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.3s",
        }}
      >
        {isDark ? (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        )}
      </span>
    </button>
  );
}
