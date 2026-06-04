"use client";

import { useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import type { Doc } from "../../../convex/_generated/dataModel";

interface TransactionFiltersProps {
  searchText: string;
  onSearchTextChange: (v: string) => void;
  fromDate: string;
  onFromDateChange: (v: string) => void;
  toDate: string;
  onToDateChange: (v: string) => void;
  accountId: string;
  onAccountIdChange: (v: string) => void;
  categoryId: string;
  onCategoryIdChange: (v: string) => void;
  accounts: Doc<"accounts">[];
  categories: Doc<"categories">[];
  hasActiveFilters: boolean;
  onClearAll: () => void;
}

export function TransactionFilters({
  searchText,
  onSearchTextChange,
  fromDate,
  onFromDateChange,
  toDate,
  onToDateChange,
  accountId,
  onAccountIdChange,
  categoryId,
  onCategoryIdChange,
  accounts,
  categories,
  hasActiveFilters,
  onClearAll,
}: TransactionFiltersProps) {
  const [advanced, setAdvanced] = useState(false);
  const gastoCategories = categories.filter((c) => c.type === "gasto" || c.type === "ambos");

  return (
    <div className="space-y-2 pb-2">
      {/* Barra de búsqueda */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <input
            type="search"
            placeholder="Buscar por descripción…"
            value={searchText}
            onChange={(e) => onSearchTextChange(e.target.value)}
            className="w-full rounded-xl border border-border bg-card pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
          />
          {searchText && (
            <button
              type="button"
              onClick={() => onSearchTextChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Limpiar búsqueda"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Botón de filtros avanzados */}
        <button
          type="button"
          onClick={() => setAdvanced((v) => !v)}
          className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
          style={advanced ? { borderColor: "var(--os-lime)", color: "var(--os-lime)", background: "color-mix(in oklch, var(--os-lime) 10%, var(--card))" } : {}}
        >
          <SlidersHorizontal size={14} />
          <span className="hidden sm:inline">Filtros</span>
          {hasActiveFilters && !advanced && (
            <span
              className="inline-flex items-center justify-center rounded-full"
              style={{ width: 6, height: 6, background: "var(--os-lime)" }}
            />
          )}
        </button>

        {/* Botón limpiar todo */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClearAll}
            className="flex items-center gap-1 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
            aria-label="Limpiar todos los filtros"
          >
            <X size={14} />
            <span className="hidden sm:inline">Limpiar</span>
          </button>
        )}
      </div>

      {/* Panel de filtros avanzados */}
      {advanced && (
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-card p-3">
          {/* Fecha desde */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Desde
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => onFromDateChange(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Fecha hasta */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Hasta
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => onToDateChange(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Cuenta */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Cuenta
            </label>
            <select
              value={accountId}
              onChange={(e) => onAccountIdChange(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Todas</option>
              {accounts.map((a) => (
                <option key={a._id} value={a._id}>{a.name}</option>
              ))}
            </select>
          </div>

          {/* Categoría */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Categoría
            </label>
            <select
              value={categoryId}
              onChange={(e) => onCategoryIdChange(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Todas</option>
              {gastoCategories.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
