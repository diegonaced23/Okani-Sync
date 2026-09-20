"use client";

// Contenedor de los 3 tabs del detalle de tarjeta:
//   1. "Ciclo actual"  — compras hechas en el ciclo en curso
//   2. "A pagar"       — cuotas del ciclo que se deben pagar este mes
//   3. "Plan completo" — vista completa con búsqueda, filtros e historial

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { FunctionReturnType } from "convex/server";
import {
  ArrowUpDown, ChevronRight, FileDown, FileSpreadsheet, FileText, Plus, Search, X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { currentMonth, formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { InstallmentRow } from "./InstallmentRow";
import { PurchaseRow } from "./PurchaseRow";
import { PurchaseSheet } from "./PurchaseSheet";
import {
  EASE_OUT_EXPO, GLASS_SURFACE, SPRING, haptic, tint,
  type InstallmentEntry, type Purchase,
} from "./shared";
import type { PaymentStatementRow } from "@/lib/reports";

type TabId = "ciclo-actual" | "a-pagar" | "plan-completo";

// Capturado al cargar el módulo — Date.now() en render es impuro para el React Compiler
const SESSION_NOW = Date.now();

// Tipo del resultado de getCardDetailData usando el helper oficial de Convex
type CardDetailData = NonNullable<FunctionReturnType<typeof api.cards.getCardDetailData>>;

const TABS: { key: TabId; label: string }[] = [
  { key: "ciclo-actual", label: "Ciclo actual" },
  { key: "a-pagar", label: "A pagar" },
  { key: "plan-completo", label: "Plan completo" },
];

interface CardCycleTabsProps {
  data: CardDetailData;
  currency: string;
  /** Mapa id → nombre de categoría para las filas */
  categoryMap: Record<string, string>;
  /** Lista completa de categorías para el filtro del Tab 3 */
  categories: Doc<"categories">[];
  card: Doc<"cards">;
  onEditPurchase: (p: Purchase) => void;
  onDeletePurchase: (id: Id<"cardPurchases">) => void;
}

// ─── Helper: mes de la próxima cuota impaga (para agrupar en Tab 3) ──────────
function nextInstallmentMonth(p: Purchase): string {
  const base = new Date(p.firstInstallmentDate);
  const totalMonths = base.getMonth() + p.paidInstallments;
  const year = base.getFullYear() + Math.floor(totalMonths / 12);
  const month = ((totalMonths % 12) + 12) % 12;
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

// ─── Helper: etiqueta y tono del grupo de mes ────────────────────────────────
function groupLabel(monthStr: string, currMonthStr: string): { text: string; tone?: string } {
  if (monthStr < currMonthStr) return { text: "Vencidas", tone: "var(--os-magenta)" };
  if (monthStr === currMonthStr) return { text: "Este mes", tone: "var(--os-lime-text)" };
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const name = d.toLocaleDateString("es-CO", { month: "long" }).replace(/^\w/, (c) => c.toUpperCase());
  return { text: y === new Date().getFullYear() ? name : `${name} ${y}` };
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function CardCycleTabs({
  data,
  currency,
  categoryMap,
  categories,
  card,
  onEditPurchase,
  onDeletePurchase,
}: CardCycleTabsProps) {
  const reduce = useReducedMotion();
  const [activeTab, setActiveTab] = useState<TabId>("ciclo-actual");
  // Estado de búsqueda y filtro solo para Tab 3 (Plan completo)
  const [searchText, setSearchText] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  // Orden del Tab 2: true = más antiguo primero (default)
  const [sortAsc, setSortAsc] = useState(true);
  const [downloading, setDownloading] = useState<"pdf" | "csv" | null>(null);
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [showSettled, setShowSettled] = useState(false);

  const currMonthStr = currentMonth();

  // ── Tab 2: cuotas ordenadas por dueDate (el backend devuelve asc) ─────────
  const sortedOverdueCuotas = useMemo(() => {
    const arr = [...data.overdueCuotas];
    return sortAsc ? arr : arr.reverse();
  }, [data.overdueCuotas, sortAsc]);

  // ── Extracto: PDF y CSV ──────────────────────────────────────────────────

  /** Convierte un ID de cuota en la fila que usan PDF y CSV. */
  function buildInstallmentEntry(instId: string): InstallmentEntry | null {
    const inst = data.installmentById[instId];
    if (!inst) return null;
    const purchase = data.allPurchases.find((p) => p._id === inst.purchaseId);
    if (!purchase) return null;
    return {
      installmentNumber: inst.installmentNumber,
      totalInstallments: purchase.totalInstallments,
      amount: inst.amount,
      dueDate: inst.dueDate,
      interestAmount: inst.interestAmount,
      principalAmount: inst.principalAmount,
      description: purchase.description,
      category: purchase.categoryId ? categoryMap[purchase.categoryId] ?? "" : "",
    };
  }

  const overdueEntries = () => sortedOverdueCuotas.flatMap((id) => {
    const e = buildInstallmentEntry(id);
    return e ? [e] : [];
  });

  /** Cuotas del ciclo en curso: el PDF tenía esta sección y nunca recibía datos. */
  const currentCycleEntries = () => data.currentCycleCuotas.flatMap((id) => {
    const e = buildInstallmentEntry(id);
    return e ? [e] : [];
  });

  const canExport = data.overdueCuotas.length > 0 || data.currentCycleCuotas.length > 0;

  async function handleDownloadCsv() {
    setDownloading("csv");
    try {
      const { generatePaymentStatementCsv, downloadCsv } = await import("@/lib/reports");
      const rows: PaymentStatementRow[] = [
        ...overdueEntries().map((entry) => ({
          ...entry,
          status: (hasOverdue ? "Vencida" : "A pagar") as PaymentStatementRow["status"],
          currency,
        })),
        ...currentCycleEntries().map((entry) => ({
          ...entry,
          status: "A pagar" as const,
          currency,
        })),
      ];
      const csv = generatePaymentStatementCsv(rows);
      const month = new Date().toISOString().slice(0, 7);
      downloadCsv(csv, `a-pagar_${card.lastFourDigits}_${month}.csv`);
      toast.success("CSV descargado");
    } catch {
      toast.error("No se pudo generar el CSV");
    } finally {
      setDownloading(null);
    }
  }

  async function handleDownloadPdf() {
    setDownloading("pdf");
    try {
      const [{ pdf }, { default: CardStatementDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/cards/CardStatementDocument"),
      ]);
      const element = (
        <CardStatementDocument
          card={card}
          cycle={data.cycle}
          overdue={overdueEntries()}
          currentCycle={currentCycleEntries()}
          minimumPayment={data.minimumPayment}
          hasOverdue={hasOverdue}
        />
      );
      const blob = await pdf(element).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const month = new Date().toISOString().slice(0, 7);
      link.download = `a-pagar_${card.lastFourDigits}_${month}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("PDF descargado");
    } catch {
      toast.error("No se pudo generar el PDF");
    } finally {
      setDownloading(null);
    }
  }

  // ── Tab 1: Ciclo actual ──────────────────────────────────────────────────

  const currentCycleTotal = data.purchasesInCurrentCycle.reduce(
    (sum, p) => sum + p.totalWithInterest,
    0
  );

  const shortDate = (ts: number) =>
    new Date(ts).toLocaleDateString("es-CO", { day: "2-digit", month: "short" });

  const prevDateStr = shortDate(data.cycle.prevCutoffTs);
  const nextDateStr = shortDate(data.cycle.nextCutoffTs);
  // Vencido = pasó el día de pago Y quedó algo facturado sin pagar. Con solo la
  // fecha, quien pagó a tiempo veía «ya venció» durante las tres semanas que van
  // del día de pago al siguiente corte.
  const hasOverdue = data.isPaymentOverdue && data.overdueCuotas.length > 0;
  // Si hay cuotas del ciclo anterior pendientes, la fecha límite es la de ese ciclo
  const relevantPaymentTs = data.overdueCuotas.length > 0
    ? data.cycle.prevPaymentTs
    : data.cycle.nextPaymentTs;
  const paymentDateStr = shortDate(relevantPaymentTs);
  const daysUntilPayment = Math.max(
    0,
    Math.ceil((relevantPaymentTs - SESSION_NOW) / 86_400_000)
  );

  // ── Tab 3: Plan completo ─────────────────────────────────────────────────

  const filtering = searchText.trim().length > 0 || catFilter.length > 0;

  const purchaseGroups = useMemo(() => {
    const filtered = data.allPurchases
      .filter((p) => !searchText || p.description.toLowerCase().includes(searchText.toLowerCase()))
      .filter((p) => !catFilter || p.categoryId === catFilter)
      .sort((a, b) => nextInstallmentMonth(a).localeCompare(nextInstallmentMonth(b)));

    const map = new Map<string, typeof filtered>();
    for (const p of filtered) {
      const key = nextInstallmentMonth(p);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return [...map.entries()];
  }, [data.allPurchases, searchText, catFilter]);

  // `?? []` por si la query todavía no se ha desplegado: sin esto la página
  // reventaría en render en vez de avisar de la función que falta.
  const settled = data.settledPurchases ?? [];

  function switchTab(next: TabId) {
    if (next === activeTab) return;
    haptic();
    setActiveTab(next);
    setOpenRowId(null);
  }

  /** Fila de cuota con su compra padre resuelta. */
  function renderInstallments(ids: string[], overdue: boolean) {
    return (
      <ul className="space-y-0.5">
        <AnimatePresence initial={false}>
          {ids.map((instId, i) => {
            const inst = data.installmentById[instId];
            if (!inst) return null;
            const purchase = data.allPurchases.find((p) => p._id === inst.purchaseId);
            if (!purchase) return null;
            return (
              <InstallmentRow
                key={instId}
                installment={inst}
                purchase={purchase}
                currency={currency}
                categoryName={purchase.categoryId ? categoryMap[purchase.categoryId] : undefined}
                index={i}
                overdue={overdue}
                openId={openRowId}
                setOpenId={setOpenRowId}
                onEdit={onEditPurchase}
                onDelete={onDeletePurchase}
              />
            );
          })}
        </AnimatePresence>
      </ul>
    );
  }

  function renderPurchases(list: Purchase[], settledList?: boolean) {
    return (
      <ul className="space-y-0.5">
        <AnimatePresence initial={false}>
          {list.map((purchase, i) => (
            <PurchaseRow
              key={purchase._id}
              purchase={purchase}
              installments={data.installmentsByPurchase[purchase._id]}
              currency={currency}
              categoryName={purchase.categoryId ? categoryMap[purchase.categoryId] : undefined}
              index={i}
              settled={settledList}
              openId={openRowId}
              setOpenId={setOpenRowId}
              onEdit={onEditPurchase}
              onDelete={onDeletePurchase}
            />
          ))}
        </AnimatePresence>
      </ul>
    );
  }

  return (
    <div className="space-y-4">
      {/* Pestañas + nueva compra */}
      <div className="flex items-center gap-2">
        <div
          role="tablist"
          aria-label="Sección de la tarjeta"
          className={cn("flex flex-1 rounded-[18px] p-1", GLASS_SURFACE)}
        >
          {TABS.map((t) => {
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`card-tab-${t.key}`}
                aria-selected={active}
                aria-controls="card-panel"
                onClick={() => switchTab(t.key)}
                className={cn(
                  "touch-hit relative flex-1 rounded-[14px] px-1 py-2 text-[13px] transition-colors",
                  active ? "font-bold text-foreground" : "font-semibold text-muted-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="card-tab-pill"
                    className="absolute inset-0 rounded-[14px] bg-[var(--surface)] shadow-[0_2px_10px_-4px_rgb(0_0_0/0.25)] dark:bg-white/10"
                    transition={SPRING}
                  />
                )}
                <span className="relative truncate">{t.label}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => { haptic(); setPurchaseOpen(true); }}
          aria-label="Nueva compra"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-[0_8px_20px_-8px_rgb(16_185_129/0.9)] transition-transform active:scale-90"
        >
          <Plus className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
        </button>
      </div>

      <div id="card-panel" role="tabpanel" aria-labelledby={`card-tab-${activeTab}`} className="relative">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={activeTab}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10 }}
            transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
            className="space-y-3"
          >
            {/* ── Tab 1: Ciclo actual ──────────────────────────────────── */}
            {activeTab === "ciclo-actual" && (
              <>
                <div className={cn("rounded-[24px] px-5 py-4", GLASS_SURFACE)}>
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    Del {prevDateStr} al {nextDateStr}
                  </p>
                  <p className="mt-1 font-mono-num text-[26px] font-extrabold leading-none tracking-tight tabular-nums text-foreground">
                    {formatCents(currentCycleTotal, currency)}
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {data.purchasesInCurrentCycle.length}{" "}
                    {data.purchasesInCurrentCycle.length === 1 ? "compra" : "compras"} en este ciclo
                  </p>
                </div>

                {data.purchasesInCurrentCycle.length === 0 ? (
                  <EmptyPanel
                    title="Sin compras este ciclo"
                    hint={`Lo que registres del ${prevDateStr} al ${nextDateStr} aparecerá aquí.`}
                  />
                ) : (
                  <div className={cn("rounded-[24px] p-1.5", GLASS_SURFACE)}>
                    {renderPurchases(data.purchasesInCurrentCycle)}
                  </div>
                )}
              </>
            )}

            {/* ── Tab 2: A pagar ───────────────────────────────────────── */}
            {activeTab === "a-pagar" && (
              <>
                {/* Pago mínimo: el conteo y el monto son del mismo bucket */}
                <div
                  className={cn("rounded-[24px] px-5 py-4", GLASS_SURFACE)}
                  style={hasOverdue ? { background: tint("var(--os-magenta)", 8) } : undefined}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p
                      className="text-[11px] font-bold uppercase tracking-[0.08em]"
                      style={{ color: hasOverdue ? "var(--os-magenta)" : undefined }}
                    >
                      {hasOverdue
                        ? `Pago mínimo · venció el ${paymentDateStr}`
                        : data.overdueCuotas.length > 0
                          ? `Pago mínimo · en ${daysUntilPayment} ${daysUntilPayment === 1 ? "día" : "días"}`
                          : `Pago mínimo · vence el ${paymentDateStr}`}
                    </p>

                    {canExport && (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          disabled={!!downloading}
                          aria-label="Descargar extracto"
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                        >
                          <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={handleDownloadPdf} disabled={downloading === "pdf"} className="gap-2">
                            <FileText className="h-4 w-4" />
                            {downloading === "pdf" ? "Generando PDF…" : "Descargar PDF"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={handleDownloadCsv} disabled={downloading === "csv"} className="gap-2">
                            <FileSpreadsheet className="h-4 w-4" />
                            {downloading === "csv" ? "Generando CSV…" : "Descargar CSV"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>

                  <p className="mt-1 font-mono-num text-[26px] font-extrabold leading-none tracking-tight tabular-nums text-foreground">
                    {formatCents(data.minimumPayment, currency)}
                  </p>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {data.overdueCuotas.length}{" "}
                      {data.overdueCuotas.length === 1 ? "cuota" : "cuotas"} del ciclo anterior
                    </p>
                    {data.overdueCuotas.length > 1 && (
                      <button
                        type="button"
                        onClick={() => { haptic(); setSortAsc((s) => !s); }}
                        className="flex shrink-0 items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                        {sortAsc ? "Antiguo primero" : "Reciente primero"}
                      </button>
                    )}
                  </div>
                </div>

                {sortedOverdueCuotas.length === 0 ? (
                  <EmptyPanel
                    title="Sin cuotas pendientes del ciclo anterior"
                    hint={`El próximo corte es el ${nextDateStr}.`}
                  />
                ) : (
                  <Group title={hasOverdue ? "Vencidas" : "Por pagar"} tone={hasOverdue ? "var(--os-magenta)" : undefined}>
                    <div className={cn("rounded-[24px] p-1.5", GLASS_SURFACE)}>
                      {renderInstallments(sortedOverdueCuotas, hasOverdue)}
                    </div>
                  </Group>
                )}

                {data.currentCycleCuotas.length > 0 && (
                  <Group title={`En el ciclo en curso · cierra el ${nextDateStr}`}>
                    <div className={cn("rounded-[24px] p-1.5", GLASS_SURFACE)}>
                      {renderInstallments(data.currentCycleCuotas, false)}
                    </div>
                  </Group>
                )}

                <p className="px-1 text-center text-xs text-muted-foreground/80">
                  Desliza una cuota para editar o eliminar su compra.
                </p>
              </>
            )}

            {/* ── Tab 3: Plan completo ─────────────────────────────────── */}
            {activeTab === "plan-completo" && (
              <>
                {data.allPurchases.length > 0 && (
                  <div className="flex gap-2">
                    <div className={cn("flex flex-1 items-center gap-2 rounded-[16px] px-3", GLASS_SURFACE)}>
                      <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <input
                        type="search"
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        placeholder="Buscar compra"
                        aria-label="Buscar compra"
                        className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70 [&::-webkit-search-cancel-button]:hidden"
                      />
                      {searchText && (
                        <button
                          type="button"
                          onClick={() => setSearchText("")}
                          aria-label="Borrar búsqueda"
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    <Select value={catFilter} onValueChange={(v) => setCatFilter(v ?? "")}>
                      <SelectTrigger className="h-[42px] w-[132px] shrink-0 rounded-[16px] text-sm">
                        <span className="truncate text-left">
                          {catFilter
                            ? categories.find((c) => c._id === catFilter)?.name ?? "Categoría"
                            : <span className="text-muted-foreground">Categoría</span>}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Todas</SelectItem>
                        {categories.map((c) => (
                          <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {data.allPurchases.length === 0 ? (
                  <EmptyPanel
                    title="No hay compras activas en esta tarjeta"
                    hint="Usa el botón + para registrar la primera."
                  />
                ) : purchaseGroups.length === 0 ? (
                  <EmptyPanel title="Sin resultados" hint="Prueba con otro texto o quita el filtro." />
                ) : (
                  purchaseGroups.map(([monthKey, group]) => {
                    const { text, tone } = groupLabel(monthKey, currMonthStr);
                    return (
                      <Group
                        key={monthKey}
                        title={text}
                        tone={tone}
                        count={group.length}
                      >
                        <div className={cn("rounded-[24px] p-1.5", GLASS_SURFACE)}>
                          {renderPurchases(group)}
                        </div>
                      </Group>
                    );
                  })
                )}

                {/* Historial: las compras liquidadas desaparecían de todas las vistas */}
                {!filtering && settled.length > 0 && (
                  <section className="space-y-2">
                    <button
                      type="button"
                      onClick={() => { haptic(); setShowSettled((v) => !v); }}
                      aria-expanded={showSettled}
                      className="flex w-full items-center gap-2 px-1 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground pointer-coarse:min-h-11"
                    >
                      <motion.span animate={{ rotate: showSettled ? 90 : 0 }} transition={{ duration: 0.2 }} className="flex">
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </motion.span>
                      Pagadas
                      <span className="rounded-full bg-muted px-1.5 text-[11px] font-bold tabular-nums">
                        {settled.length}
                      </span>
                    </button>
                    <AnimatePresence initial={false}>
                      {showSettled && (
                        <motion.div
                          initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                          animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
                          exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                          transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
                          className="overflow-hidden"
                        >
                          <div className={cn("rounded-[24px] p-1.5", GLASS_SURFACE)}>
                            {renderPurchases(settled, true)}
                          </div>
                          {settled.length >= 50 && (
                            <p className="px-1 pt-2 text-[11px] text-muted-foreground/80">
                              Se muestran las 50 compras liquidadas más recientes.
                            </p>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </section>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <PurchaseSheet
        cardId={card._id}
        cardName={card.name}
        currency={currency}
        defaultInterestRate={card.interestRate}
        purchase={null}
        open={purchaseOpen}
        onOpenChange={setPurchaseOpen}
      />
    </div>
  );
}

// ─── Piezas ───────────────────────────────────────────────────────────────────

function Group({
  title,
  tone,
  count,
  children,
}: {
  title: string;
  tone?: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2" aria-label={title}>
      <h3
        className="flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground"
        style={tone ? { color: tone } : undefined}
      >
        {title}
        {count !== undefined && (
          <span className="rounded-full bg-muted px-1.5 text-[10px] font-bold tabular-nums text-muted-foreground">
            {count}
          </span>
        )}
      </h3>
      {children}
    </section>
  );
}

function EmptyPanel({ title, hint }: { title: string; hint: string }) {
  return (
    <div className={cn("rounded-[24px] px-6 py-8 text-center", GLASS_SURFACE)}>
      <p className="text-sm font-bold text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
