"use client";

// Componente reutilizable de tabs estilo pill, extraído del patrón
// inline de NewTransactionModal. Usa la misma estética (borde redondeado,
// transición spring) que el resto de la app.

interface PillTab<T extends string> {
  key: T;
  label: string;
}

interface PillTabsProps<T extends string> {
  tabs: PillTab<T>[];
  active: T;
  onChange: (tab: T) => void;
  ariaLabel: string;
  className?: string;
}

export function PillTabs<T extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
  className = "",
}: PillTabsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex rounded-[14px] p-1 ${className}`}
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          id={`tab-${tab.key}`}
          aria-selected={active === tab.key}
          aria-controls={`panel-${tab.key}`}
          onClick={() => onChange(tab.key)}
          // py-2 garantiza touch target de ≥44px con el padding del contenedor
          className="flex-1 py-2 text-[13px]"
          style={{
            borderRadius: 10,
            background: active === tab.key ? "var(--surface)" : "transparent",
            color: active === tab.key ? "var(--foreground)" : "var(--muted-foreground)",
            fontWeight: active === tab.key ? 700 : 600,
            boxShadow: active === tab.key ? "var(--shadow-sm)" : "none",
            transition: "all 0.2s cubic-bezier(0.34,1.56,0.64,1)",
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
