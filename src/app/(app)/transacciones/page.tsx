"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useState, useMemo, useEffect, useCallback } from "react";
import { useAppData } from "@/contexts/app-data";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { TransactionItem } from "@/components/transactions/TransactionItem";
import { TransactionDetailSheet } from "@/components/transactions/TransactionDetailSheet";
import { TransactionFilters } from "@/components/transactions/TransactionFilters";
import { CardPurchaseItem } from "@/components/transactions/CardPurchaseItem";
import { CardPurchaseDetailSheet } from "@/components/transactions/CardPurchaseDetailSheet";
import { currentMonth, formatCents } from "@/lib/money";
import { useNewTransactionModal } from "@/contexts/new-transaction-modal";

// ─── Tipos de filtro ───────────────────────────────────────────────────────────

type TxFilter = "all" | "ingreso" | "gasto" | "gasto_tarjeta" | "transferencia";

const FILTER_PILLS: { key: TxFilter; label: string }[] = [
  { key: "all",            label: "Todos" },
  { key: "ingreso",        label: "Ingresos" },
  { key: "gasto",          label: "Gastos" },
  { key: "gasto_tarjeta",  label: "Tarjetas de crédito" },
  { key: "transferencia",  label: "Transferencias" },
];

// ─── Utilidades ────────────────────────────────────────────────────────────────

function shiftMonth(m: string, delta: number) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Formatea "2026-04" → "Abril 2026"
function monthLabel(m: string) {
  const [year, month] = m.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  const name = date.toLocaleDateString("es-CO", { month: "long" })
    .replace(/^\w/, (c) => c.toUpperCase());
  return `${name} ${year}`;
}

// ─── Separador entre filas del mismo día ──────────────────────────────────────

function TxSeparator() {
  return <div style={{ height: 1, background: "var(--border)", margin: "0 16px" }} />;
}

// ─── Cabecera de agrupación por día ───────────────────────────────────────────

// Recibe el label ya calculado desde groupedByDay (calculado una vez por grupo, no en cada render)
function DayHeader({ label }: { label: string }) {
  return (
    <div
      className="flex items-center px-4 py-1.5"
      style={{
        background: "color-mix(in oklch, var(--surface-2) 80%, transparent)",
        borderBottom: "1px solid color-mix(in oklch, var(--border) 50%, transparent)",
      }}
    >
      <span
        style={{
          fontSize: 11, fontWeight: 700, letterSpacing: "0.05em",
          color: "var(--muted-foreground)", textTransform: "capitalize",
        }}
      >
        {label}
      </span>
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function TransaccionesPage() {
  const today = currentMonth();
  const { openModal } = useNewTransactionModal();

  const [month, setMonth]           = useState(() => today);
  const [filter, setFilter]         = useState<TxFilter>("all");
  const [selectedTx, setSelectedTx]           = useState<Doc<"transactions"> | null>(null);
  const [detailOpen, setDetailOpen]           = useState(false);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<Id<"cardPurchases"> | null>(null);
  const [purchaseDetailOpen, setPurchaseDetailOpen] = useState(false);

  // Handler estable: los setters de useState son estables entre renders, por eso el array de deps está vacío.
  // Sin esto, cada render crearía una función nueva por ítem y React.memo en TransactionItem no tendría efecto.
  const handleTransactionPress = useCallback((tx: Doc<"transactions">) => {
    if (tx.cardPurchaseId) {
      setSelectedPurchaseId(tx.cardPurchaseId as Id<"cardPurchases">);
      setPurchaseDetailOpen(true);
    } else {
      setSelectedTx(tx);
      setDetailOpen(true);
    }
  }, []);

  // ── Estados de búsqueda y filtros avanzados ───────────────────────────────
  // searchInput: valor inmediato del campo (se actualiza en cada pulsación de teclado)
  // searchText:  valor debounced que se pasa a useQuery (se actualiza 300 ms después)
  const [searchInput,  setSearchInput]  = useState("");
  const [searchText,   setSearchText]   = useState("");
  const [fromDate,     setFromDate]     = useState("");
  const [toDate,       setToDate]       = useState("");
  const [filterAccId,  setFilterAccId]  = useState("");
  const [filterCatId,  setFilterCatId]  = useState("");

  // Debounce: evita disparar una query Convex en cada pulsación de teclado.
  // La query de búsqueda solo se lanza 300 ms después de que el usuario deja de escribir.
  useEffect(() => {
    const id = setTimeout(() => setSearchText(searchInput), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  // isSearchMode controla qué query se activa (usa el valor debounced)
  const isSearchMode = searchText.trim() !== "" || fromDate !== "" || toDate !== "" || filterAccId !== "" || filterCatId !== "";
  // hasActiveFilters usa searchInput para que el indicador visual reaccione de inmediato
  const hasActiveFilters = searchInput.trim() !== "" || fromDate !== "" || toDate !== "" || filterAccId !== "" || filterCatId !== "";

  function clearAllFilters() {
    setSearchInput(""); setSearchText(""); setFromDate(""); setToDate(""); setFilterAccId(""); setFilterCatId("");
  }

  // Convierte "YYYY-MM-DD" a timestamp (inicio/fin del día local)
  const fromTs = fromDate ? new Date(fromDate + "T00:00:00").getTime() : undefined;
  const toTs   = toDate   ? new Date(toDate   + "T23:59:59.999").getTime() : undefined;

  const typeForSearch = filter !== "all"
    ? (filter === "gasto" ? undefined : filter)  // "gasto" es multi-tipo en browse; en search dejamos filtrar en cliente
    : undefined;

  // ── Queries ───────────────────────────────────────────────────────────────
  const searchResults = useQuery(
    api.transactions.search,
    isSearchMode
      ? {
          text:       searchText.trim() || undefined,
          fromDate:   fromTs,
          toDate:     toTs,
          type:       typeForSearch,
          accountId:  filterAccId  ? (filterAccId  as Id<"accounts">)  : undefined,
          categoryId: filterCatId  ? (filterCatId  as Id<"categories">) : undefined,
        }
      : "skip"
  );
  const monthResults       = useQuery(api.transactions.listByMonth, !isSearchMode ? { month } : "skip");
  const purchasesOfMonth   = useQuery(api.cardPurchases.listByPurchaseMonth, !isSearchMode ? { month } : "skip");
  // Totales del mes calculados en el servidor con conversión multi-moneda correcta
  const summaries          = useQuery(api.transactions.monthlySummary, !isSearchMode ? { months: [month] } : "skip");

  const rawTransactions = isSearchMode ? searchResults : monthResults;

  const { accounts, cards, categories } = useAppData();
  const me           = useQuery(api.users.getMe);

  const catMap = useMemo(
    () => Object.fromEntries(
      (categories ?? []).map((c) => [c._id, { name: c.name, icon: c.icon, color: c.color }])
    ),
    [categories]
  );

  const accountMap = useMemo(
    () => Object.fromEntries((accounts ?? []).map((a) => [a._id, a.name])),
    [accounts]
  );

  const cardMap = useMemo(
    () => Object.fromEntries(
      (cards ?? []).map((c) => [c._id, { name: c.name, lastFourDigits: c.lastFourDigits }])
    ),
    [cards]
  );

  // ── Totales del mes — calculados en el servidor con conversión multi-moneda ──
  // monthlySummary convierte todos los montos a la moneda preferida del usuario (user.currency ?? "COP")
  // antes de sumarlos, evitando comparar montos en divisas distintas sin conversión.
  const monthSummary    = summaries?.[0];
  const monthIngresos   = isSearchMode ? 0 : (monthSummary?.ingresos ?? 0);
  const monthGastos     = isSearchMode ? 0 : (monthSummary?.gastos   ?? 0);
  const displayCurrency = me?.currency ?? "COP";

  // ── Lista filtrada: tipo (pill) + texto client-side ────────────────────────

  type ListItem =
    | { kind: "tx";       item: Doc<"transactions"> }
    | { kind: "purchase"; item: Doc<"cardPurchases"> };

  const filteredTxs: Doc<"transactions">[] = useMemo(() => {
    let all = rawTransactions ?? [];

    if (isSearchMode && searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      all = all.filter((t) => t.description.toLowerCase().includes(q));
    }

    if (filter === "all")          return all;
    if (filter === "gasto")        return all.filter((t) => t.type === "gasto" || t.type === "pago_deuda");
    if (filter === "gasto_tarjeta") return all.filter((t) => t.type === "gasto_tarjeta");
    if (filter === "transferencia") return all.filter((t) => t.type === "transferencia" || t.type === "pago_tarjeta");
    return all.filter((t) => t.type === filter);
  }, [rawTransactions, filter, searchText, isSearchMode]);

  // Las compras (padre) solo se muestran en modo browse y en filtros relevantes
  const filteredPurchases: Doc<"cardPurchases">[] = useMemo(() => {
    if (isSearchMode) return [];
    if (filter === "all" || filter === "gasto_tarjeta") return purchasesOfMonth ?? [];
    return [];
  }, [purchasesOfMonth, filter, isSearchMode]);

  const totalCount    = (rawTransactions ?? []).length;
  const filteredCount = filteredTxs.length;
  const isFiltered    = filter !== "all" || isSearchMode;

  const canGoForward  = month < today;
  // Limite de navegación: 24 meses hacia el pasado para evitar confusión en usuarios nuevos
  const oldestMonth   = shiftMonth(today, -24);
  const canGoBack     = month > oldestMonth;

  // Claves del día de hoy y ayer para las cabeceras de grupo (calculadas una vez al montar)
  const [todayKey]     = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [yesterdayKey] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

  // Combinar txs y compras padre, ordenados por fecha desc, agrupados por día.
  // El label de cada día se calcula aquí una vez (no en cada render de DayHeader).
  const groupedByDay = useMemo(() => {
    const allItems: { date: number; item: ListItem }[] = [
      ...filteredTxs.map((tx) => ({ date: tx.date,           item: { kind: "tx"       as const, item: tx } })),
      ...filteredPurchases.map((p) => ({ date: p.purchaseDate, item: { kind: "purchase" as const, item: p } })),
    ];
    allItems.sort((a, b) => b.date - a.date);

    const groups: { dayKey: string; label: string; items: ListItem[] }[] = [];
    for (const { date, item } of allItems) {
      const d   = new Date(date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const last = groups[groups.length - 1];
      if (last?.dayKey === key) {
        last.items.push(item);
      } else {
        let label: string;
        if (key === todayKey) {
          label = "Hoy";
        } else if (key === yesterdayKey) {
          label = "Ayer";
        } else {
          label = new Date(date).toLocaleDateString("es-CO", {
            weekday: "long", day: "numeric", month: "short",
          }).replace(/^\w/, (c) => c.toUpperCase());
        }
        groups.push({ dayKey: key, label, items: [item] });
      }
    }
    return groups;
  }, [filteredTxs, filteredPurchases, todayKey, yesterdayKey]);

  return (
    <div className="max-w-2xl mx-auto space-y-0">

      {/* ── Encabezado ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between pb-4">
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.03em", margin: 0, lineHeight: 1.1 }}>
            Movimientos
          </h1>
          {/* Selector de mes inline */}
          <div className="flex items-center gap-1 mt-1">
            <button
              type="button"
              onClick={() => setMonth((m) => shiftMonth(m, -1))}
              disabled={!canGoBack}
              title={!canGoBack ? "Límite de 24 meses alcanzado" : undefined}
              className="w-11 h-11 flex items-center justify-center rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-30"
              aria-label="Mes anterior"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-sm text-muted-foreground">
              {monthLabel(month)}
              {rawTransactions !== undefined && (
                <>
                  {" · "}
                  <span className="font-medium">
                    {isFiltered
                      ? `${filteredCount} de ${totalCount} transacciones`
                      : `${totalCount} transacciones`}
                  </span>
                </>
              )}
            </span>
            <button
              type="button"
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
              disabled={!canGoForward}
              className="w-11 h-11 flex items-center justify-center rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-30"
              aria-label="Mes siguiente"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            {/* Botón "Hoy": aparece cuando el mes seleccionado no es el actual */}
            {month !== today && (
              <button
                type="button"
                onClick={() => setMonth(today)}
                aria-label="Volver al mes actual"
                className="rounded-full px-2.5 py-1 text-xs font-semibold transition-colors"
                style={{
                  background: "color-mix(in oklch, var(--os-cyan) 15%, var(--surface))",
                  color: "var(--os-cyan)",
                  border: "1px solid color-mix(in oklch, var(--os-cyan) 30%, var(--border))",
                }}
              >
                Hoy
              </button>
            )}
          </div>
        </div>

        {/* Botón nueva transacción — solo visible en desktop; en mobile usa el FAB del bottom nav */}
        <Button
          size="sm"
          onClick={() => openModal()}
          className="gap-1.5 mt-1 hidden lg:inline-flex bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-500 hover:to-teal-600 text-white border-0 shadow-md"
        >
          <Plus className="h-4 w-4" /> Nueva
        </Button>
      </div>

      {/* ── Búsqueda y filtros avanzados ────────────────────────────────────── */}
      <div className="pb-2">
        <TransactionFilters
          searchText={searchInput}
          onSearchTextChange={setSearchInput}
          fromDate={fromDate}
          onFromDateChange={setFromDate}
          toDate={toDate}
          onToDateChange={setToDate}
          accountId={filterAccId}
          onAccountIdChange={setFilterAccId}
          categoryId={filterCatId}
          onCategoryIdChange={setFilterCatId}
          hasActiveFilters={hasActiveFilters}
          onClearAll={clearAllFilters}
        />
      </div>

      {/* ── Stats del mes (solo en modo browse) ─────────────────────────────── */}
      {!isSearchMode && (
      <div className="grid grid-cols-2 gap-3 pb-4">
        {rawTransactions === undefined ? (
          <>
            <Skeleton className="h-[76px] rounded-xl" />
            <Skeleton className="h-[76px] rounded-xl" />
          </>
        ) : (
          <>
            <div
              className="rounded-xl p-4"
              style={{
                background: "color-mix(in oklch, var(--os-lime) 12%, var(--card))",
                border: "1px solid color-mix(in oklch, var(--os-lime) 28%, var(--border))",
              }}
            >
              <p
                style={{
                  fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "0.08em", color: "var(--muted-foreground)", marginBottom: 4,
                }}
              >
                Ingresos
              </p>
              <p className="font-mono-num" style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.025em", color: "var(--os-lime)" }}>
                {formatCents(monthIngresos, displayCurrency)}
              </p>
            </div>
            <div
              className="rounded-xl p-4"
              style={{
                background: "color-mix(in oklch, var(--os-magenta) 10%, var(--card))",
                border: "1px solid color-mix(in oklch, var(--os-magenta) 25%, var(--border))",
              }}
            >
              <p
                style={{
                  fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "0.08em", color: "var(--muted-foreground)", marginBottom: 4,
                }}
              >
                Gastos
              </p>
              <p className="font-mono-num" style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.025em", color: "var(--os-magenta)" }}>
                {formatCents(monthGastos, displayCurrency)}
              </p>
            </div>
          </>
        )}
      </div>
      )}

      {/* ── Filter pills — WAI-ARIA radiogroup con navegación por flechas ────── */}
      <div
        role="radiogroup"
        aria-label="Filtrar por tipo"
        className="flex gap-2 pb-4 overflow-x-auto"
        style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
        onKeyDown={(e) => {
          const current = FILTER_PILLS.findIndex((p) => p.key === filter);
          let next = -1;
          if (e.key === "ArrowRight" || e.key === "ArrowDown") {
            e.preventDefault();
            next = (current + 1) % FILTER_PILLS.length;
          } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
            e.preventDefault();
            next = (current - 1 + FILTER_PILLS.length) % FILTER_PILLS.length;
          }
          if (next !== -1) {
            setFilter(FILTER_PILLS[next].key);
            (e.currentTarget.querySelectorAll('[role="radio"]')[next] as HTMLElement)?.focus();
          }
        }}
      >
        {FILTER_PILLS.map(({ key, label }) => {
          const isActive = filter === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setFilter(key)}
              className="flex-none whitespace-nowrap transition-all"
              style={{
                padding: "8px 16px",
                borderRadius: 9999,
                fontSize: 13,
                fontWeight: isActive ? 700 : 600,
                cursor: "pointer",
                border: isActive
                  ? "1.5px solid var(--os-lime)"
                  : "1.5px solid var(--border)",
                background: isActive
                  ? "color-mix(in oklch, var(--os-lime) 12%, var(--surface))"
                  : "var(--surface)",
                color: isActive ? "var(--foreground)" : "var(--muted-foreground)",
                transition: "all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Lista de transacciones ───────────────────────────────────────────── */}
      {rawTransactions === undefined ? (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: "var(--card)", border: "1px solid var(--border)" }}
        >
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        </div>
      ) : groupedByDay.length === 0 ? (
        <div
          className="rounded-xl p-12 text-center"
          style={{ background: "var(--card)", border: "1px solid var(--border)" }}
        >
          <p className="text-sm text-muted-foreground">
            {isSearchMode
              ? "No se encontraron transacciones con esos filtros."
              : filter === "all"
              ? `No hay transacciones en ${monthLabel(month).toLowerCase()}.`
              : `No hay ${FILTER_PILLS.find((f) => f.key === filter)?.label.toLowerCase() ?? "registros"} en ${monthLabel(month).toLowerCase()}.`}
          </p>
          {filter !== "all" && (
            <button
              type="button"
              onClick={() => setFilter("all")}
              className="mt-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Ver todos
            </button>
          )}
          {/* CTA para mobile: el FAB del bottom nav está oculto en esta vista vacía, así que
              mostramos un botón visible solo en pantallas pequeñas */}
          {!isSearchMode && filter === "all" && (
            <button
              type="button"
              onClick={() => openModal()}
              className="lg:hidden mt-4 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition-all active:scale-[0.97]"
              style={{
                background: "linear-gradient(135deg, var(--os-cyan), var(--os-lime))",
                color: "var(--primary-foreground)",
                boxShadow: "0 6px 16px -4px color-mix(in oklch, var(--os-cyan) 50%, transparent)",
              }}
            >
              <Plus className="h-4 w-4" />
              Agregar transacción
            </button>
          )}
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: "var(--card)", border: "1px solid var(--border)" }}
        >
          {groupedByDay.map((group, gi) => (
            <div key={group.dayKey}>
              {gi > 0 && <div style={{ height: 1, background: "var(--border)" }} />}
              <DayHeader label={group.label} />
              {group.items.map((listItem, i) => (
                <div key={listItem.kind === "tx" ? listItem.item._id : `purchase-${listItem.item._id}`}>
                  {listItem.kind === "tx" ? (
                    <TransactionItem
                      transaction={listItem.item}
                      category={listItem.item.categoryId ? catMap[listItem.item.categoryId] : undefined}
                      accountMap={accountMap}
                      cardMap={cardMap}
                      onPress={handleTransactionPress}
                    />
                  ) : (
                    <CardPurchaseItem
                      purchase={listItem.item}
                      cardName={cardMap[listItem.item.cardId]?.name}
                      onPress={() => {
                        setSelectedPurchaseId(listItem.item._id);
                        setPurchaseDetailOpen(true);
                      }}
                    />
                  )}
                  {i < group.items.length - 1 && <TxSeparator />}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ── Sheet de detalle / edición / eliminación ────────────────────────── */}
      <TransactionDetailSheet
        transaction={selectedTx}
        open={detailOpen}
        onOpenChange={(o) => {
          setDetailOpen(o);
          if (!o) setSelectedTx(null);
        }}
      />

      {/* ── Sheet de detalle de compra con tarjeta ───────────────────────────── */}
      <CardPurchaseDetailSheet
        purchaseId={selectedPurchaseId}
        open={purchaseDetailOpen}
        onOpenChange={(o) => {
          setPurchaseDetailOpen(o);
          if (!o) setSelectedPurchaseId(null);
        }}
      />

    </div>
  );
}
