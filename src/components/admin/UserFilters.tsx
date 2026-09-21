"use client";

import { Search, X } from "lucide-react";
import { FIELD_LABEL, GLASS_SURFACE, OVERFLOW_ROW, haptic, tint } from "@/lib/ios";
import { cn } from "@/lib/utils";

/** Rol: coincide con `users.role`, más "todos". */
export type RoleFilter = "all" | "admin" | "user";
/** Estado de la cuenta (`active`), no confundir con actividad de uso. */
export type StatusFilter = "all" | "active" | "inactive";
/** Actividad de uso real, calculada con `activityStatus`. */
export type ActivityFilter = "all" | "recent" | "dormant";

export interface UserFiltersValue {
  search: string;
  role: RoleFilter;
  status: StatusFilter;
  activity: ActivityFilter;
}

export const EMPTY_FILTERS: UserFiltersValue = {
  search: "",
  role: "all",
  status: "all",
  activity: "all",
};

interface Option<T extends string> {
  value: T;
  label: string;
}

const ROLE_OPTIONS: Option<RoleFilter>[] = [
  { value: "all", label: "Todos" },
  { value: "admin", label: "Admin" },
  { value: "user", label: "Usuario" },
];

const STATUS_OPTIONS: Option<StatusFilter>[] = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Activos" },
  { value: "inactive", label: "Desactivados" },
];

const ACTIVITY_OPTIONS: Option<ActivityFilter>[] = [
  { value: "all", label: "Todos" },
  { value: "recent", label: "Con sesión reciente" },
  { value: "dormant", label: "Dormidos" },
];

function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <span className={FIELD_LABEL}>{label}</span>
      <div role="radiogroup" aria-label={label} className={OVERFLOW_ROW}>
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => { haptic(); onChange(opt.value); }}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-[background-color,border-color,transform] active:scale-95",
                selected ? "text-foreground" : "border-border bg-[var(--surface-2)] text-muted-foreground",
              )}
              style={selected ? { background: tint("var(--os-cyan)", 18), borderColor: tint("var(--os-cyan)", 55) } : undefined}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Filtros de la lista de usuarios: búsqueda + tres grupos de chips.
 *
 * Todo el filtrado ocurre en el cliente sobre la proyección de
 * `listForAdmin` — a esta escala (decenas de usuarios) mover el filtrado al
 * servidor sería trabajo sin beneficio real; el corte para hacerlo son 500
 * usuarios (ver `docs/superpowers/specs/2026-09-20-modulo-admin-design.md`).
 */
export function UserFilters({
  value,
  onChange,
}: {
  value: UserFiltersValue;
  onChange: (next: UserFiltersValue) => void;
}) {
  const hasActive =
    value.search.trim() !== "" ||
    value.role !== "all" ||
    value.status !== "all" ||
    value.activity !== "all";

  return (
    <div className="space-y-3">
      <div className={cn("flex items-center gap-2 rounded-[16px] px-3", GLASS_SURFACE)}>
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          aria-label="Buscar por nombre o correo"
          placeholder="Buscar por nombre o correo…"
          value={value.search}
          onChange={(e) => onChange({ ...value, search: e.target.value })}
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/70 [&::-webkit-search-cancel-button]:hidden"
        />
        {value.search && (
          <button
            type="button"
            onClick={() => onChange({ ...value, search: "" })}
            aria-label="Limpiar búsqueda"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-transform active:scale-90"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      <ChipGroup label="Rol" options={ROLE_OPTIONS} value={value.role} onChange={(role) => onChange({ ...value, role })} />
      <ChipGroup label="Estado" options={STATUS_OPTIONS} value={value.status} onChange={(status) => onChange({ ...value, status })} />
      <ChipGroup label="Actividad" options={ACTIVITY_OPTIONS} value={value.activity} onChange={(activity) => onChange({ ...value, activity })} />

      {hasActive && (
        <button
          type="button"
          onClick={() => { haptic(); onChange(EMPTY_FILTERS); }}
          className="flex items-center gap-1 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" /> Limpiar filtros
        </button>
      )}
    </div>
  );
}
