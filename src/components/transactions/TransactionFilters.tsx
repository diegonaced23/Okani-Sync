"use client";

import { useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { useAppData } from "@/contexts/app-data";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { FIELD_LABEL } from "@/lib/ios";
import { cn, formatDateShort } from "@/lib/utils";
import { EASE_OUT_EXPO, GLASS_SURFACE, haptic, tint } from "./shared";

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
  const reduce = useReducedMotion();
  const { accounts, categories } = useAppData();
  const [advanced, setAdvanced] = useState(false);
  const panelId = useId();

  // Todas las categorías, no solo las de gasto: si el selector se limitaba a gasto y
  // «ambos», buscar un ingreso por su categoría era imposible.
  const allCategories = categories ?? [];

  // Filtros avanzados activos; la búsqueda por texto no cuenta, tiene su propia X
  const advancedCount = [fromDate, toDate, accountId, categoryId].filter(Boolean).length;

  const accountName = accountId ? ((accounts ?? []).find((a) => a._id === accountId)?.name ?? null) : null;
  const categoryName = categoryId ? (allCategories.find((c) => c._id === categoryId)?.name ?? null) : null;

  /** "YYYY-MM-DD" → texto legible con el formateador del proyecto. */
  function chipDate(d: string) {
    return formatDateShort(new Date(`${d}T12:00:00`).getTime());
  }

  const chips = [
    fromDate && { key: "from", label: `Desde ${chipDate(fromDate)}`, clear: () => onFromDateChange("") },
    toDate && { key: "to", label: `Hasta ${chipDate(toDate)}`, clear: () => onToDateChange("") },
    accountName && { key: "acc", label: accountName, clear: () => onAccountIdChange("") },
    categoryName && { key: "cat", label: categoryName, clear: () => onCategoryIdChange("") },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  return (
    <div className="space-y-2">
      {/* Búsqueda y accesos a los filtros */}
      <div className="flex items-center gap-2">
        <div className={cn("flex min-w-0 flex-1 items-center gap-2 rounded-[16px] px-3", GLASS_SURFACE)}>
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            aria-label="Buscar movimientos por descripción"
            placeholder="Buscar por descripción"
            value={searchText}
            onChange={(e) => onSearchTextChange(e.target.value)}
            className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/70 [&::-webkit-search-cancel-button]:hidden"
          />
          {searchText && (
            <button
              type="button"
              onClick={() => onSearchTextChange("")}
              aria-label="Limpiar búsqueda"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-transform active:scale-90"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => { haptic(); setAdvanced((v) => !v); }}
          aria-expanded={advanced}
          aria-controls={panelId}
          aria-label="Filtros avanzados"
          className={cn(
            "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] transition-[background-color,color,transform] active:scale-90",
            advanced ? "text-foreground" : cn("text-muted-foreground", GLASS_SURFACE),
          )}
          style={advanced ? { background: tint("var(--os-lime)", 16), color: "var(--os-lime-text)" } : undefined}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          {advancedCount > 0 && !advanced && (
            <span
              className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold leading-none text-white"
              style={{ background: "var(--os-lime-ring)" }}
              aria-label={`${advancedCount} filtro${advancedCount > 1 ? "s" : ""} activo${advancedCount > 1 ? "s" : ""}`}
            >
              {advancedCount}
            </span>
          )}
        </button>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => { haptic(); onClearAll(); }}
            aria-label="Limpiar todos los filtros"
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] text-muted-foreground transition-transform active:scale-90",
              GLASS_SURFACE,
            )}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Lo que está filtrando ahora mismo, cuando el panel está cerrado */}
      <AnimatePresence initial={false}>
        {chips.length > 0 && !advanced && (
          <motion.ul
            initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, height: "auto" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: 0.24, ease: EASE_OUT_EXPO }}
            className="flex flex-wrap gap-1.5 overflow-hidden"
            aria-label="Filtros activos"
          >
            {chips.map((chip) => (
              <li key={chip.key}>
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
                  style={{ background: tint("var(--os-cyan)", 14), color: "var(--os-cyan-text)" }}
                >
                  {chip.label}
                  <button
                    type="button"
                    onClick={() => { haptic(); chip.clear(); }}
                    aria-label={`Quitar filtro: ${chip.label}`}
                    className="ml-0.5 transition-opacity hover:opacity-70"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      {/* Panel avanzado */}
      <AnimatePresence initial={false}>
        {advanced && (
          <motion.div
            id={panelId}
            initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, height: "auto" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
            className="overflow-hidden"
          >
            <div className={cn("grid grid-cols-2 gap-3 rounded-[20px] p-4", GLASS_SURFACE)}>
              <div className="space-y-2">
                <label htmlFor="filter-from-date" className={FIELD_LABEL}>Desde</label>
                <DatePicker
                  id="filter-from-date"
                  value={fromDate}
                  onChange={onFromDateChange}
                  className="h-11 rounded-[14px]"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="filter-to-date" className={FIELD_LABEL}>Hasta</label>
                <DatePicker
                  id="filter-to-date"
                  value={toDate}
                  onChange={onToDateChange}
                  className="h-11 rounded-[14px]"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="filter-account" className={FIELD_LABEL}>Cuenta</label>
                <Select value={accountId} onValueChange={(v) => onAccountIdChange(v ?? "")}>
                  <SelectTrigger id="filter-account" className="h-11 w-full rounded-[14px]">
                    <span className="flex-1 truncate text-left text-sm">
                      {accountName ?? "Todas"}
                    </span>
                  </SelectTrigger>
                  <SelectContent side="bottom" alignItemWithTrigger={false} className="max-h-[30vh]">
                    <SelectItem value="">Todas</SelectItem>
                    {(accounts ?? []).map((a) => (
                      <SelectItem key={a._id} value={a._id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label htmlFor="filter-category" className={FIELD_LABEL}>Categoría</label>
                <Select value={categoryId} onValueChange={(v) => onCategoryIdChange(v ?? "")}>
                  <SelectTrigger id="filter-category" className="h-11 w-full rounded-[14px]">
                    <span className="flex-1 truncate text-left text-sm">
                      {categoryName ?? "Todas"}
                    </span>
                  </SelectTrigger>
                  <SelectContent side="bottom" alignItemWithTrigger={false} className="max-h-[30vh]">
                    <SelectItem value="">Todas</SelectItem>
                    {allCategories.map((c) => (
                      <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
