"use client";

import { useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { formatDateShort } from "@/lib/utils";
import { useAppData } from "@/contexts/app-data";

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
  hasActiveFilters,
  onClearAll,
}: TransactionFiltersProps) {
  const { accounts, categories } = useAppData();
  const [advanced, setAdvanced] = useState(false);
  const gastoCategories = (categories ?? []).filter((c) => c.type === "gasto" || c.type === "ambos");

  // Número de filtros avanzados activos (excluye búsqueda por texto, que tiene su propio X)
  const advancedFilterCount = [fromDate, toDate, accountId, categoryId].filter(Boolean).length;

  // Nombres resueltos para los chips (solo se buscan cuando el valor existe)
  const selectedAccountName  = accountId  ? ((accounts  ?? []).find((a) => a._id === accountId)?.name  ?? null) : null;
  const selectedCategoryName = categoryId ? ((categories ?? []).find((c) => c._id === categoryId)?.name ?? null) : null;

  // Convierte "YYYY-MM-DD" a texto legible usando el formateador del proyecto
  function chipDate(d: string) {
    return formatDateShort(new Date(d + "T12:00:00").getTime());
  }

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

        {/* Botón de filtros avanzados — badge numérico cuando hay filtros activos */}
        <button
          type="button"
          onClick={() => setAdvanced((v) => !v)}
          className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
          style={advanced ? { borderColor: "var(--os-lime)", color: "var(--os-lime)", background: "color-mix(in oklch, var(--os-lime) 10%, var(--card))" } : {}}
          aria-pressed={advanced}
        >
          <SlidersHorizontal size={14} aria-hidden="true" />
          <span className="hidden sm:inline">Filtros</span>
          {advancedFilterCount > 0 && !advanced && (
            <span
              className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold leading-none"
              style={{ background: "var(--os-lime)", color: "var(--background)" }}
              aria-label={`${advancedFilterCount} filtro${advancedFilterCount > 1 ? "s" : ""} activo${advancedFilterCount > 1 ? "s" : ""}`}
            >
              {advancedFilterCount}
            </span>
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

      {/* Chips de filtros activos — visibles solo cuando el panel está cerrado */}
      {advancedFilterCount > 0 && !advanced && (
        <div className="flex flex-wrap gap-1.5" role="list" aria-label="Filtros activos">
          {fromDate && (
            <span
              role="listitem"
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
              style={{
                background: "color-mix(in oklch, var(--os-cyan) 10%, var(--card))",
                border: "1px solid color-mix(in oklch, var(--os-cyan) 22%, var(--border))",
                color: "var(--foreground)",
              }}
            >
              Desde: {chipDate(fromDate)}
              <button
                type="button"
                onClick={() => onFromDateChange("")}
                className="ml-0.5 hover:opacity-70 transition-opacity"
                aria-label="Quitar filtro de fecha desde"
              >
                <X size={11} aria-hidden="true" />
              </button>
            </span>
          )}
          {toDate && (
            <span
              role="listitem"
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
              style={{
                background: "color-mix(in oklch, var(--os-cyan) 10%, var(--card))",
                border: "1px solid color-mix(in oklch, var(--os-cyan) 22%, var(--border))",
                color: "var(--foreground)",
              }}
            >
              Hasta: {chipDate(toDate)}
              <button
                type="button"
                onClick={() => onToDateChange("")}
                className="ml-0.5 hover:opacity-70 transition-opacity"
                aria-label="Quitar filtro de fecha hasta"
              >
                <X size={11} aria-hidden="true" />
              </button>
            </span>
          )}
          {selectedAccountName && (
            <span
              role="listitem"
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
              style={{
                background: "color-mix(in oklch, var(--os-cyan) 10%, var(--card))",
                border: "1px solid color-mix(in oklch, var(--os-cyan) 22%, var(--border))",
                color: "var(--foreground)",
              }}
            >
              {selectedAccountName}
              <button
                type="button"
                onClick={() => onAccountIdChange("")}
                className="ml-0.5 hover:opacity-70 transition-opacity"
                aria-label={`Quitar filtro de cuenta: ${selectedAccountName}`}
              >
                <X size={11} aria-hidden="true" />
              </button>
            </span>
          )}
          {selectedCategoryName && (
            <span
              role="listitem"
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
              style={{
                background: "color-mix(in oklch, var(--os-cyan) 10%, var(--card))",
                border: "1px solid color-mix(in oklch, var(--os-cyan) 22%, var(--border))",
                color: "var(--foreground)",
              }}
            >
              {selectedCategoryName}
              <button
                type="button"
                onClick={() => onCategoryIdChange("")}
                className="ml-0.5 hover:opacity-70 transition-opacity"
                aria-label={`Quitar filtro de categoría: ${selectedCategoryName}`}
              >
                <X size={11} aria-hidden="true" />
              </button>
            </span>
          )}
        </div>
      )}

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
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-base md:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-base md:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
              {(accounts ?? []).map((a) => (
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
