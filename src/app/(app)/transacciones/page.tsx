"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Plus, Receipt } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { useAppData } from "@/contexts/app-data";
import { useNewTransactionModal } from "@/contexts/new-transaction-modal";
import { PageContainer } from "@/components/layout/PageContainer";
import { MonthStepper, shiftMonth } from "@/components/ui/month-stepper";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CardPurchaseDetailSheet } from "@/components/transactions/CardPurchaseDetailSheet";
import { CardPurchaseItem } from "@/components/transactions/CardPurchaseItem";
import { TransactionDetailSheet } from "@/components/transactions/TransactionDetailSheet";
import { TransactionFilters } from "@/components/transactions/TransactionFilters";
import { TransactionRow } from "@/components/transactions/TransactionRow";
import {
  EASE_OUT_EXPO,
  GLASS_SURFACE,
  MONTH_LIST_CAP,
  SEARCH_CAP,
  SPRING,
  haptic,
  totalsByCurrency,
} from "@/components/transactions/shared";
import { currentMonth, formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

// ─── Tipos de filtro ───────────────────────────────────────────────────────────

type TxFilter = "all" | "ingreso" | "gasto" | "gasto_tarjeta" | "transferencia";

const FILTER_PILLS: { key: TxFilter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "ingreso", label: "Ingresos" },
  { key: "gasto", label: "Gastos" },
  { key: "gasto_tarjeta", label: "Tarjetas" },
  { key: "transferencia", label: "Transferencias" },
];

/** Formatea "2026-04" → "abril de 2026" para los textos en prosa. */
function monthLabel(m: string) {
  const [year, month] = m.split("-").map(Number);
  const name = new Date(year, month - 1, 1).toLocaleDateString("es-CO", { month: "long" });
  return `${name} de ${year}`;
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function TransaccionesPage() {
  const today = currentMonth();
  const reduce = useReducedMotion();
  const { openModal } = useNewTransactionModal();

  const [month, setMonth] = useState(() => today);
  const [filter, setFilter] = useState<TxFilter>("all");
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  // Se guarda el id, no el objeto: la fila viva se re-deriva de la query en cada
  // render, así que al guardar una edición el detalle muestra ya lo nuevo. La
  // instantánea queda como respaldo por si el movimiento sale del mes o del filtro.
  const [selectedTxId, setSelectedTxId] = useState<Id<"transactions"> | null>(null);
  const [selectedTxFallback, setSelectedTxFallback] = useState<Doc<"transactions"> | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<Id<"cardPurchases"> | null>(null);
  const [purchaseDetailOpen, setPurchaseDetailOpen] = useState(false);
  const [deletingTx, setDeletingTx] = useState<Doc<"transactions"> | null>(null);
  const [deleting, setDeleting] = useState(false);

  const removeTx = useMutation(api.transactions.remove);

  // Handlers estables: los setters de useState lo son, por eso las deps van vacías.
  // Sin esto cada render crearía una función nueva por fila y el memo de TransactionRow
  // no serviría de nada.
  const handleTransactionPress = useCallback((tx: Doc<"transactions">) => {
    if (tx.cardPurchaseId) {
      setSelectedPurchaseId(tx.cardPurchaseId as Id<"cardPurchases">);
      setPurchaseDetailOpen(true);
    } else {
      setSelectedTxId(tx._id);
      setSelectedTxFallback(tx);
      setDetailOpen(true);
    }
  }, []);

  const handlePurchasePress = useCallback((purchase: Doc<"cardPurchases">) => {
    setSelectedPurchaseId(purchase._id);
    setPurchaseDetailOpen(true);
  }, []);

  // Deslizar a «Editar» abre el detalle, que ya tiene su modo de edición: así hay un
  // solo camino para editar y no dos implementaciones que se puedan desincronizar.
  const handleEdit = useCallback((tx: Doc<"transactions">) => {
    setSelectedTxId(tx._id);
    setSelectedTxFallback(tx);
    setDetailOpen(true);
  }, []);

  const handleDeleteRequest = useCallback((tx: Doc<"transactions">) => {
    setDeletingTx(tx);
  }, []);

  // ── Búsqueda y filtros avanzados ──────────────────────────────────────────
  // searchInput: valor inmediato del campo; searchText: el mismo 300 ms después
  const [searchInput, setSearchInput] = useState("");
  const [searchText, setSearchText] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [filterAccId, setFilterAccId] = useState("");
  const [filterCatId, setFilterCatId] = useState("");

  // Debounce: evita disparar una query de Convex en cada pulsación
  useEffect(() => {
    const id = setTimeout(() => setSearchText(searchInput), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  // isSearchMode decide qué query se activa (con el valor ya debounced)
  const isSearchMode =
    searchText.trim() !== "" || fromDate !== "" || toDate !== "" || filterAccId !== "" || filterCatId !== "";
  // hasActiveFilters usa el valor inmediato para que el indicador reaccione al instante
  const hasActiveFilters =
    searchInput.trim() !== "" || fromDate !== "" || toDate !== "" || filterAccId !== "" || filterCatId !== "";

  function clearAllFilters() {
    setSearchInput("");
    setSearchText("");
    setFromDate("");
    setToDate("");
    setFilterAccId("");
    setFilterCatId("");
  }

  // "YYYY-MM-DD" → timestamp del inicio y del fin del día local
  const fromTs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : undefined;
  const toTs = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : undefined;

  // «Gastos» y «Transferencias» son píldoras multi-tipo (gasto+pago_deuda,
  // transferencia+pago_tarjeta): en búsqueda se resuelven en el filtro de cliente,
  // igual que en navegación, para no excluir en silencio pago_tarjeta ni pago_deuda.
  const typeForSearch =
    filter !== "all" && filter !== "gasto" && filter !== "transferencia" ? filter : undefined;

  // ── Queries ───────────────────────────────────────────────────────────────
  const searchResults = useQuery(
    api.transactions.search,
    isSearchMode
      ? {
          text: searchText.trim() || undefined,
          fromDate: fromTs,
          toDate: toTs,
          type: typeForSearch,
          accountId: filterAccId ? (filterAccId as Id<"accounts">) : undefined,
          categoryId: filterCatId ? (filterCatId as Id<"categories">) : undefined,
        }
      : "skip"
  );
  const monthResults = useQuery(api.transactions.listByMonth, !isSearchMode ? { month } : "skip");
  const purchasesOfMonth = useQuery(api.cardPurchases.listByPurchaseMonth, !isSearchMode ? { month } : "skip");
  // Totales del mes calculados en el servidor, con conversión multi-moneda correcta
  const summaries = useQuery(api.transactions.monthlySummary, !isSearchMode ? { months: [month] } : "skip");

  const rawTransactions = isSearchMode ? searchResults : monthResults;

  const { accounts, cards, categories } = useAppData();
  const me = useQuery(api.users.getMe);

  const catMap = useMemo(
    () =>
      Object.fromEntries(
        (categories ?? []).map((c) => [c._id, { name: c.name, icon: c.icon, color: c.color }])
      ),
    [categories]
  );

  const accountMap = useMemo(
    () => Object.fromEntries((accounts ?? []).map((a) => [a._id, a.name])),
    [accounts]
  );

  const cardMap = useMemo(
    () =>
      Object.fromEntries(
        (cards ?? []).map((c) => [c._id, { name: c.name, lastFourDigits: c.lastFourDigits }])
      ),
    [cards]
  );

  const monthSummary = summaries?.[0];
  const displayCurrency = me?.currency ?? "COP";

  // ── Lista filtrada: tipo (píldora) + texto en cliente ─────────────────────
  const filteredTxs: Doc<"transactions">[] = useMemo(() => {
    const all = rawTransactions ?? [];
    if (filter === "all") return all;
    if (filter === "gasto") return all.filter((t) => t.type === "gasto" || t.type === "pago_deuda");
    if (filter === "gasto_tarjeta") return all.filter((t) => t.type === "gasto_tarjeta");
    if (filter === "transferencia") {
      return all.filter((t) => t.type === "transferencia" || t.type === "pago_tarjeta");
    }
    return all.filter((t) => t.type === filter);
  }, [rawTransactions, filter]);

  // Las compras (el registro padre) solo aparecen navegando, no buscando
  const filteredPurchases: Doc<"cardPurchases">[] = useMemo(() => {
    if (isSearchMode) return [];
    if (filter === "all" || filter === "gasto_tarjeta") return purchasesOfMonth ?? [];
    return [];
  }, [purchasesOfMonth, filter, isSearchMode]);

  // Totales de lo que se está viendo cuando se busca: el resumen del servidor es
  // del mes, y buscando se cruzan meses. Se suman por moneda, sin convertir.
  const searchTotals = useMemo(
    () => (isSearchMode ? totalsByCurrency(filteredTxs) : null),
    [isSearchMode, filteredTxs]
  );

  // La fila viva manda sobre la instantánea: así el detalle es reactivo
  const selectedTx = useMemo(
    () => (rawTransactions ?? []).find((t) => t._id === selectedTxId) ?? selectedTxFallback,
    [rawTransactions, selectedTxId, selectedTxFallback]
  );

  const totalCount = (rawTransactions ?? []).length;
  const filteredCount = filteredTxs.length;
  const isFiltered = filter !== "all" || isSearchMode;
  // El backend acota lo que devuelve: si se llegó al tope, el contador no es el total
  const cap = isSearchMode ? SEARCH_CAP : MONTH_LIST_CAP;
  const truncated = totalCount >= cap;

  const oldestMonth = shiftMonth(today, -24);

  // Claves de hoy y ayer para las cabeceras de día (se calculan una vez al montar)
  const [todayKey] = useState<string>(() => dayKey(Date.now()));
  const [yesterdayKey] = useState<string>(() => dayKey(Date.now() - 86_400_000));

  type ListItem =
    | { kind: "tx"; item: Doc<"transactions"> }
    | { kind: "purchase"; item: Doc<"cardPurchases"> };

  // Movimientos y compras en una sola lista, por fecha descendente y agrupados por
  // día. La etiqueta de cada día se calcula aquí una vez, no en cada render.
  const groupedByDay = useMemo(() => {
    const allItems: { date: number; item: ListItem }[] = [
      ...filteredTxs.map((tx) => ({ date: tx.date, item: { kind: "tx" as const, item: tx } })),
      ...filteredPurchases.map((p) => ({
        date: p.purchaseDate,
        item: { kind: "purchase" as const, item: p },
      })),
    ];
    allItems.sort((a, b) => b.date - a.date);

    const groups: { dayKey: string; label: string; items: ListItem[] }[] = [];
    for (const { date, item } of allItems) {
      const key = dayKey(date);
      const last = groups[groups.length - 1];
      if (last?.dayKey === key) {
        last.items.push(item);
        continue;
      }
      const label =
        key === todayKey
          ? "Hoy"
          : key === yesterdayKey
            ? "Ayer"
            : new Date(date)
                .toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "short" })
                .replace(/^\w/, (c) => c.toUpperCase());
      groups.push({ dayKey: key, label, items: [item] });
    }
    return groups;
  }, [filteredTxs, filteredPurchases, todayKey, yesterdayKey]);

  async function confirmDelete() {
    if (!deletingTx) return;
    setDeleting(true);
    try {
      await removeTx({ transactionId: deletingTx._id });
      haptic(15);
      toast.success("Movimiento eliminado");
      setDeletingTx(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo eliminar");
    } finally {
      setDeleting(false);
    }
  }

  const isLoading = rawTransactions === undefined;
  let rowIndex = 0;

  return (
    <PageContainer className="space-y-4">
      {/* ── Cabecera ─────────────────────────────────────────────────────── */}
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-foreground">
            Movimientos
          </h1>
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? "Cargando…"
              : isFiltered
                ? `${filteredCount} de ${truncated ? `${totalCount}+` : totalCount}`
                : `${truncated ? `${totalCount}+` : totalCount} ${totalCount === 1 ? "movimiento" : "movimientos"}`}
          </p>
          {/* Anuncia el resultado del filtro a lectores de pantalla */}
          {!isLoading && (
            <span className="sr-only" aria-live="polite" aria-atomic="true">
              {isFiltered
                ? `${filteredCount} de ${totalCount} movimientos encontrados`
                : `${totalCount} movimientos`}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => { haptic(); openModal(); }}
          aria-label="Nuevo movimiento"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-emerald-400 text-white shadow-[0_8px_20px_-8px_rgb(16_185_129/0.9)] transition-transform active:scale-90"
        >
          <Plus className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
        </button>
      </header>

      {/* Navegando: el mes. Buscando no aplica, porque la búsqueda cruza meses. */}
      {!isSearchMode && (
        <MonthStepper month={month} onChange={setMonth} minMonth={oldestMonth} showToday />
      )}

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

      {/* ── Resumen ──────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-[84px] rounded-[22px]" />
          <Skeleton className="h-[84px] rounded-[22px]" />
        </div>
      ) : isSearchMode ? (
        searchTotals && searchTotals.currencies.length > 0 && (
          <SearchTotals totals={searchTotals} count={filteredCount} />
        )
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Stat
            label="Ingresos"
            value={formatCents(monthSummary?.ingresos ?? 0, displayCurrency)}
            tone="var(--os-lime)"
            text="var(--os-lime-text)"
          />
          <Stat
            label="Gastos"
            value={formatCents(monthSummary?.gastos ?? 0, displayCurrency)}
            tone="var(--os-magenta)"
            text="var(--os-magenta)"
          />
        </div>
      )}

      {/* ── Píldoras de tipo ─────────────────────────────────────────────── */}
      <div
        role="radiogroup"
        aria-label="Filtrar por tipo"
        className={cn("flex gap-1 rounded-[18px] p-1", GLASS_SURFACE)}
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
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              onClick={() => { haptic(); setFilter(key); setOpenRowId(null); }}
              className={cn(
                "touch-hit relative min-w-0 flex-1 rounded-[14px] px-1 py-2 text-[12px] transition-colors",
                active ? "font-bold text-foreground" : "font-semibold text-muted-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId="tx-filter-pill"
                  className="absolute inset-0 rounded-[14px] bg-[var(--surface)] shadow-[0_2px_10px_-4px_rgb(0_0_0/0.25)] dark:bg-white/10"
                  transition={SPRING}
                />
              )}
              <span className="relative block truncate">{label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Lista ────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className={cn("space-y-1.5 rounded-[24px] p-2", GLASS_SURFACE)}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 rounded-[18px]" />
          ))}
        </div>
      ) : groupedByDay.length === 0 ? (
        <EmptyState
          isSearchMode={isSearchMode}
          filter={filter}
          month={month}
          onClearFilter={() => setFilter("all")}
          onCreate={() => openModal()}
        />
      ) : (
        <>
          <div className="space-y-3">
            {groupedByDay.map((group) => (
              <section key={group.dayKey} className="space-y-1.5">
                <h2 className="px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  {group.label}
                </h2>
                <div className={cn("rounded-[24px] p-1.5", GLASS_SURFACE)}>
                  <ul className="space-y-0.5">
                    <AnimatePresence initial={false}>
                      {group.items.map((listItem) =>
                        listItem.kind === "tx" ? (
                          <TransactionRow
                            key={listItem.item._id}
                            transaction={listItem.item}
                            category={
                              listItem.item.categoryId ? catMap[listItem.item.categoryId] : undefined
                            }
                            accountMap={accountMap}
                            cardMap={cardMap}
                            index={rowIndex++}
                            openId={openRowId}
                            setOpenId={setOpenRowId}
                            onPress={handleTransactionPress}
                            onEdit={handleEdit}
                            onDelete={handleDeleteRequest}
                          />
                        ) : (
                          <motion.li
                            key={`purchase-${listItem.item._id}`}
                            initial={reduce ? false : { opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                              duration: 0.32,
                              ease: EASE_OUT_EXPO,
                              delay: Math.min(rowIndex++, 12) * 0.025,
                            }}
                            className="list-none overflow-hidden rounded-[18px]"
                          >
                            <CardPurchaseItem
                              purchase={listItem.item}
                              cardName={cardMap[listItem.item.cardId]?.name}
                              onPress={handlePurchasePress}
                            />
                          </motion.li>
                        )
                      )}
                    </AnimatePresence>
                  </ul>
                </div>
              </section>
            ))}
          </div>

          {truncated && (
            <p className="px-1 text-center text-xs text-muted-foreground/80">
              {isSearchMode
                ? `La búsqueda muestra los primeros ${cap} resultados. Acota las fechas o la cuenta para ver menos.`
                : `Se muestran los primeros ${cap} movimientos del mes.`}
            </p>
          )}

          <p className="px-1 text-center text-xs text-muted-foreground/80">
            Desliza un movimiento para editarlo o eliminarlo.
          </p>
        </>
      )}

      {/* ── Hojas y confirmación ─────────────────────────────────────────── */}
      <TransactionDetailSheet
        transaction={selectedTx}
        open={detailOpen}
        onOpenChange={(o) => {
          setDetailOpen(o);
          if (!o) {
            setSelectedTxId(null);
            setSelectedTxFallback(null);
          }
        }}
      />

      <CardPurchaseDetailSheet
        purchaseId={selectedPurchaseId}
        open={purchaseDetailOpen}
        onOpenChange={(o) => {
          setPurchaseDetailOpen(o);
          if (!o) setSelectedPurchaseId(null);
        }}
      />

      <AlertDialog
        open={deletingTx !== null}
        onOpenChange={(o) => { if (!o) setDeletingTx(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar «{deletingTx?.description}»?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingTx?.type === "transferencia"
                ? "Se eliminarán ambas partes de la transferencia y se revertirán los saldos de las dos cuentas."
                : "Esta acción es irreversible. Se revertirá el saldo de la cuenta o tarjeta correspondiente."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Eliminando…" : "Sí, eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}

// ─── Piezas ───────────────────────────────────────────────────────────────────

/** "YYYY-MM-DD" en hora local; agrupa las filas por día. */
function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Stat({
  label,
  value,
  tone,
  text,
}: {
  label: string;
  value: string;
  tone: string;
  text: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
      className={cn("relative overflow-hidden rounded-[22px] p-4", GLASS_SURFACE)}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full opacity-[0.16] blur-2xl"
        style={{ background: tone }}
      />
      <p className="relative text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p
        className="relative mt-1 truncate font-mono-num text-[22px] font-extrabold leading-none tracking-tight tabular-nums"
        style={{ color: text }}
      >
        {value}
      </p>
    </motion.div>
  );
}

/** Suma de lo que se está viendo al buscar, una línea por moneda. */
function SearchTotals({
  totals,
  count,
}: {
  totals: { currencies: string[]; income: Record<string, number>; expense: Record<string, number> };
  count: number;
}) {
  return (
    <div className={cn("space-y-1.5 rounded-[22px] px-4 py-3", GLASS_SURFACE)}>
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        {count} {count === 1 ? "resultado" : "resultados"}
      </p>
      {totals.currencies.map((currency) => {
        const income = totals.income[currency] ?? 0;
        const expense = totals.expense[currency] ?? 0;
        return (
          <div key={currency} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-xs font-semibold text-muted-foreground">{currency}</span>
            <span className="flex gap-3 font-mono-num tabular-nums">
              {income > 0 && (
                <span style={{ color: "var(--os-lime-text)" }}>+{formatCents(income, currency)}</span>
              )}
              {expense > 0 && (
                <span style={{ color: "var(--os-magenta)" }}>−{formatCents(expense, currency)}</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function EmptyState({
  isSearchMode,
  filter,
  month,
  onClearFilter,
  onCreate,
}: {
  isSearchMode: boolean;
  filter: TxFilter;
  month: string;
  onClearFilter: () => void;
  onCreate: () => void;
}) {
  const reduce = useReducedMotion();
  const pill = FILTER_PILLS.find((f) => f.key === filter);

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
      className={cn("relative overflow-hidden rounded-[28px] px-6 pb-7 pt-8 text-center", GLASS_SURFACE)}
    >
      <div className="relative mx-auto mb-6 h-28 w-28" aria-hidden="true">
        {[0.35, 0.62, 0.88].map((v, i) => (
          <motion.svg
            key={v}
            viewBox="0 0 100 100"
            className="absolute -rotate-90"
            style={{ inset: i * 10 }}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.1 }}
          >
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              strokeWidth="8"
              stroke="color-mix(in oklch, var(--os-cyan) 16%, transparent)"
            />
            <motion.circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              strokeWidth="8"
              strokeLinecap="round"
              stroke={["var(--os-cyan)", "var(--os-lime)", "var(--os-violet)"][i]}
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: v }}
              transition={{ duration: 1.1, delay: 0.2 + i * 0.15, ease: EASE_OUT_EXPO }}
            />
          </motion.svg>
        ))}
        <span className="absolute inset-[34px] flex items-center justify-center text-foreground">
          <Receipt className="h-6 w-6" />
        </span>
      </div>

      <h2 className="text-lg font-extrabold tracking-tight text-foreground">
        {isSearchMode
          ? "Nada coincide con esos filtros"
          : filter === "all"
            ? `Sin movimientos en ${monthLabel(month)}`
            : `Sin ${pill?.label.toLowerCase() ?? "registros"} en ${monthLabel(month)}`}
      </h2>
      <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground">
        {isSearchMode
          ? "Prueba con otro texto, o amplía el rango de fechas."
          : "Cada gasto e ingreso que registres alimenta tus presupuestos, reportes y patrimonio."}
      </p>

      {filter !== "all" && !isSearchMode && (
        <button
          type="button"
          onClick={onClearFilter}
          className="mt-4 text-sm font-semibold text-foreground underline-offset-4 hover:underline"
        >
          Ver todos los movimientos
        </button>
      )}

      {!isSearchMode && filter === "all" && (
        <button
          type="button"
          onClick={onCreate}
          className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-gradient-to-r from-cyan-400 to-emerald-400 text-[15px] font-bold text-white shadow-[0_10px_24px_-10px_rgb(16_185_129/0.8)] transition-transform active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Registrar un movimiento
        </button>
      )}
    </motion.div>
  );
}
