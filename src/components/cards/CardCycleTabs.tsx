"use client";

// Contenedor de los 3 tabs del detalle de tarjeta:
//   1. "Ciclo actual"  — compras hechas en el ciclo en curso
//   2. "A pagar"       — cuotas del ciclo que se deben pagar este mes
//   3. "Plan completo" — vista completa con búsqueda y filtros (la vista anterior)

import { useState, useMemo } from "react";
import { api } from "../../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Search, Plus, ArrowUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AppSheet } from "@/components/ui/app-sheet";
import { PillTabs } from "@/components/ui/pill-tabs";
import { CompactPurchaseRow } from "./CompactPurchaseRow";
import { CompactInstallmentRow } from "./CompactInstallmentRow";
import { PurchaseForm } from "./PurchaseForm";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import { formatCents, currentMonth } from "@/lib/money";

type TabId = "ciclo-actual" | "a-pagar" | "plan-completo";

// Tipo del resultado de getCardDetailData usando el helper oficial de Convex
type CardDetailData = NonNullable<FunctionReturnType<typeof api.cards.getCardDetailData>>;

const TABS = [
  { key: "ciclo-actual" as const, label: "Ciclo actual" },
  { key: "a-pagar" as const, label: "A pagar" },
  { key: "plan-completo" as const, label: "Plan completo" },
];

interface CardCycleTabsProps {
  data: CardDetailData;
  currency: string;
  // Mapa id → nombre de categoría para mostrar en las filas
  categoryMap: Record<string, string>;
  // Lista completa de categorías para el filtro del Tab 3
  categories: Doc<"categories">[];
  card: Doc<"cards">;
  onEditPurchase: (p: Doc<"cardPurchases">) => void;
  onDeletePurchase: (id: Id<"cardPurchases">) => void;
}

// ─── Helper: mes de la próxima cuota impaga (para agrupar en Tab 3) ──────────
function nextInstallmentMonth(p: Doc<"cardPurchases">): string {
  const base = new Date(p.firstInstallmentDate);
  const totalMonths = base.getMonth() + p.paidInstallments;
  const year = base.getFullYear() + Math.floor(totalMonths / 12);
  const month = ((totalMonths % 12) + 12) % 12;
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

// ─── Helper: etiqueta y variante visual del grupo de mes ─────────────────────
function groupLabel(
  monthStr: string,
  currMonthStr: string
): { text: string; variant: "overdue" | "current" | "future" } {
  if (monthStr < currMonthStr) return { text: "Vencidas", variant: "overdue" };
  if (monthStr === currMonthStr) return { text: "Este mes", variant: "current" };
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const name = d
    .toLocaleDateString("es-CO", { month: "long" })
    .replace(/^\w/, (c) => c.toUpperCase());
  const text = y === new Date().getFullYear() ? name : `${name} ${y}`;
  return { text, variant: "future" };
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
  const [activeTab, setActiveTab] = useState<TabId>("ciclo-actual");
  // Estado de búsqueda y filtro solo para Tab 3 (Plan completo)
  const [searchText, setSearchText] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  // Orden del Tab 2 "A pagar": true = más antiguo primero (default), false = más reciente primero
  const [sortAsc, setSortAsc] = useState(true);

  const currMonthStr = currentMonth();

  // ── Tab 2: cuotas ordenadas por dueDate (el backend devuelve asc por defecto) ──
  // sortAsc=true → más antiguo primero (default), sortAsc=false → más reciente primero
  const sortedOverdueCuotas = useMemo(() => {
    const arr = [...data.overdueCuotas];
    return sortAsc ? arr : arr.reverse();
  }, [data.overdueCuotas, sortAsc]);

  const sortedCurrentCycleCuotas = useMemo(() => {
    const arr = [...data.currentCycleCuotas];
    return sortAsc ? arr : arr.reverse();
  }, [data.currentCycleCuotas, sortAsc]);

  // ── Tab 1: Ciclo actual ────────────────────────────────────────────────────

  // Total gastado en el ciclo actual (suma de las compras por su cuota mensual)
  const currentCycleTotal = data.purchasesInCurrentCycle.reduce(
    (sum, p) => sum + p.totalWithInterest,
    0
  );

  const prevDateStr = new Date(data.cycle.prevCutoffTs).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
  });
  const nextDateStr = new Date(data.cycle.nextCutoffTs).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
  });
  // Si hay cuotas vencidas, el pago del ciclo anterior ya venció → mostrar esa fecha.
  // De lo contrario, mostrar la fecha de pago del ciclo actual (siempre futura).
  const hasOverdue = data.overdueCuotas.length > 0;
  const relevantPaymentTs = hasOverdue ? data.cycle.prevPaymentTs : data.cycle.nextPaymentTs;
  const paymentDateStr = new Date(relevantPaymentTs).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
  });

  // ── Tab 3: Plan completo (con filtros) ─────────────────────────────────────

  const purchaseGroups = useMemo(() => {
    const filtered = data.allPurchases
      .filter((p) =>
        !searchText || p.description.toLowerCase().includes(searchText.toLowerCase())
      )
      .filter((p) => !catFilter || p.categoryId === catFilter)
      .sort((a, b) => {
        // Ordenar cronológicamente por mes de la próxima cuota
        return nextInstallmentMonth(a).localeCompare(nextInstallmentMonth(b));
      });

    const map = new Map<string, typeof filtered>();
    for (const p of filtered) {
      const key = nextInstallmentMonth(p);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return [...map.entries()];
  }, [data.allPurchases, searchText, catFilter]);

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Barra de tabs + botón "Nueva compra" en la misma línea */}
      <div className="flex items-center gap-2">
        <PillTabs
          tabs={TABS}
          active={activeTab}
          onChange={setActiveTab}
          ariaLabel="Sección de tarjeta"
          className="flex-1"
        />
        {/* Botón de nueva compra siempre visible para acceso rápido */}
        <AppSheet
          open={purchaseOpen}
          onOpenChange={setPurchaseOpen}
          title={`Nueva compra — ${card.name}`}
          trigger={
            <Button size="sm" variant="outline" className="shrink-0 h-[42px] gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Nueva compra</span>
              <span className="sm:hidden">+</span>
            </Button>
          }
        >
          <PurchaseForm
            cardId={card._id}
            defaultInterestRate={card.interestRate}
            currency={currency}
            onSuccess={() => setPurchaseOpen(false)}
          />
        </AppSheet>
      </div>

      {/* ── Tab 1: Ciclo actual ─────────────────────────────────────────────── */}
      {activeTab === "ciclo-actual" && (
        <div
          role="tabpanel"
          id="panel-ciclo-actual"
          aria-labelledby="tab-ciclo-actual"
          className="space-y-3"
        >
          {/* Resumen del ciclo en curso */}
          <div className="rounded-xl bg-card border border-border px-4 py-3 space-y-0.5">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
              Del {prevDateStr} al {nextDateStr}
            </p>
            <p className="text-xl font-bold tabular-nums text-foreground">
              {formatCents(currentCycleTotal, currency)}
            </p>
            <p className="text-xs text-muted-foreground">
              {data.purchasesInCurrentCycle.length} compra
              {data.purchasesInCurrentCycle.length !== 1 ? "s" : ""} en este ciclo
            </p>
          </div>

          {/* Lista de compras hechas en el ciclo actual */}
          {data.purchasesInCurrentCycle.length === 0 ? (
            <div className="rounded-xl bg-card border border-border px-4 py-8 text-center">
              <p className="text-sm font-medium text-foreground">Sin compras este ciclo</p>
              <p className="text-xs text-muted-foreground mt-1">
                Las compras que registres del {prevDateStr} al {nextDateStr} aparecerán aquí.
              </p>
            </div>
          ) : (
            <div className="rounded-xl bg-card border border-border overflow-hidden">
              {data.purchasesInCurrentCycle.map((purchase) => (
                <CompactPurchaseRow
                  key={purchase._id}
                  purchase={purchase}
                  installments={
                    data.installmentsByPurchase[purchase._id] as Parameters<
                      typeof CompactPurchaseRow
                    >[0]["installments"]
                  }
                  currency={currency}
                  categoryName={purchase.categoryId ? categoryMap[purchase.categoryId] : undefined}
                  onEdit={onEditPurchase}
                  onDelete={onDeletePurchase}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab 2: A pagar ─────────────────────────────────────────────────── */}
      {activeTab === "a-pagar" && (
        <div
          role="tabpanel"
          id="panel-a-pagar"
          aria-labelledby="tab-a-pagar"
          className="space-y-3"
        >
          {/* Bloque de vencidas — cuotas anteriores al ciclo activo sin pagar */}
          {sortedOverdueCuotas.length > 0 && (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--os-magenta)" }}>
              {/* Cabecera: título, total y botón de orden */}
              <div
                className="px-4 py-2 flex items-center justify-between gap-2"
                style={{ background: "color-mix(in oklch, var(--os-magenta) 12%, var(--surface))" }}
              >
                <span
                  className="text-[11px] font-bold uppercase tracking-widest"
                  style={{ color: "var(--os-magenta)" }}
                >
                  Vencidas ({sortedOverdueCuotas.length})
                </span>
                <span
                  className="text-sm font-bold tabular-nums"
                  style={{ color: "var(--os-magenta)" }}
                >
                  {formatCents(
                    data.overdueCuotas.reduce(
                      (s, id) => s + (data.installmentById[id]?.amount ?? 0),
                      0
                    ),
                    currency
                  )}
                </span>
              </div>
              {/* Filas de cuotas vencidas con acciones */}
              {sortedOverdueCuotas.map((instId) => {
                const inst = data.installmentById[instId];
                if (!inst) return null;
                const purchase = data.allPurchases.find((p) => p._id === inst.purchaseId);
                if (!purchase) return null;
                return (
                  <CompactInstallmentRow
                    key={instId}
                    installment={inst}
                    purchase={purchase}
                    currency={currency}
                    categoryName={purchase.categoryId ? categoryMap[purchase.categoryId] : undefined}
                    onEdit={onEditPurchase}
                    onDelete={onDeletePurchase}
                  />
                );
              })}
            </div>
          )}

          {/* Resumen del pago mínimo + control de orden */}
          <div
            className="rounded-xl px-4 py-3 space-y-0.5 border"
            style={
              hasOverdue
                ? {
                    // Indicador visual de pago vencido cuando hay cuotas sin pagar del ciclo anterior
                    borderColor: "var(--os-magenta)",
                    background: "color-mix(in oklch, var(--os-magenta) 6%, var(--card))",
                  }
                : { borderColor: "var(--border)", background: "var(--card)" }
            }
          >
            <p
              className="text-[11px] uppercase tracking-wider font-semibold"
              style={{ color: hasOverdue ? "var(--os-magenta)" : "var(--muted-foreground)" }}
            >
              {/* Si hay cuotas vencidas, el pago del ciclo anterior ya pasó */}
              Pago mínimo · {hasOverdue ? `Venció el ${paymentDateStr}` : `Vence ${paymentDateStr}`}
            </p>
            <p className="text-xl font-bold tabular-nums text-foreground">
              {formatCents(data.minimumPayment, currency)}
            </p>
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs text-muted-foreground">
                {data.currentCycleCuotas.length} cuota
                {data.currentCycleCuotas.length !== 1 ? "s" : ""} del ciclo actual
              </p>
              {/* Botón para alternar el orden de las fechas */}
              {data.currentCycleCuotas.length > 1 && (
                <button
                  type="button"
                  onClick={() => setSortAsc((s) => !s)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={sortAsc ? "Cambiar a más reciente primero" : "Cambiar a más antiguo primero"}
                >
                  <ArrowUpDown className="h-3 w-3" />
                  {sortAsc ? "Antiguo primero" : "Reciente primero"}
                </button>
              )}
            </div>
          </div>

          {/* Lista de cuotas del ciclo actual */}
          {sortedCurrentCycleCuotas.length === 0 ? (
            <div className="rounded-xl bg-card border border-border px-4 py-8 text-center">
              <p className="text-sm font-medium text-foreground">
                Sin cuotas pendientes este ciclo
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                El corte es el {nextDateStr}
              </p>
            </div>
          ) : (
            <div className="rounded-xl bg-card border border-border overflow-hidden">
              {sortedCurrentCycleCuotas.map((instId) => {
                const inst = data.installmentById[instId];
                if (!inst) return null;
                const purchase = data.allPurchases.find((p) => p._id === inst.purchaseId);
                if (!purchase) return null;
                return (
                  <CompactInstallmentRow
                    key={instId}
                    installment={inst}
                    purchase={purchase}
                    currency={currency}
                    categoryName={purchase.categoryId ? categoryMap[purchase.categoryId] : undefined}
                    onEdit={onEditPurchase}
                    onDelete={onDeletePurchase}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab 3: Plan completo ───────────────────────────────────────────── */}
      {activeTab === "plan-completo" && (
        <div
          role="tabpanel"
          id="panel-plan-completo"
          aria-labelledby="tab-plan-completo"
          className="space-y-3"
        >
          {/* Filtros: búsqueda + categoría */}
          {data.allPurchases.length > 0 && (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Buscar compra…"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
              <Select value={catFilter} onValueChange={(v) => setCatFilter(v ?? "")}>
                <SelectTrigger className="h-8 w-[140px] text-sm shrink-0">
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

          {/* Estado vacío general */}
          {data.allPurchases.length === 0 ? (
            <div className="rounded-xl bg-card border border-border px-4 py-8 text-center">
              <p className="text-sm font-medium text-foreground">
                No hay compras activas en esta tarjeta
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Usa el botón &ldquo;+ Nueva compra&rdquo; para registrar tu primera compra.
              </p>
            </div>
          ) : purchaseGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center rounded-xl bg-card border border-border">
              Sin resultados para los filtros aplicados.
            </p>
          ) : (
            /* Grupos de compras por mes de próxima cuota */
            <div className="space-y-3">
              {purchaseGroups.map(([monthKey, group]) => {
                const { text, variant } = groupLabel(monthKey, currMonthStr);
                return (
                  <div key={monthKey} className="space-y-1">
                    {/* Cabecera del grupo */}
                    <div className="flex items-center gap-2 px-1">
                      <span
                        className="text-[11px] font-bold uppercase tracking-widest"
                        style={{
                          color:
                            variant === "overdue"
                              ? "var(--os-magenta)"
                              : variant === "current"
                              ? "var(--os-lime)"
                              : "var(--muted-foreground)",
                        }}
                      >
                        {text}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-medium">
                        ({group.length} compra{group.length !== 1 ? "s" : ""})
                      </span>
                    </div>
                    {/* Filas de compra */}
                    <div className="rounded-xl bg-card border border-border overflow-hidden">
                      {group.map((purchase) => (
                        <CompactPurchaseRow
                          key={purchase._id}
                          purchase={purchase}
                          installments={
                            data.installmentsByPurchase[purchase._id] as Parameters<
                              typeof CompactPurchaseRow
                            >[0]["installments"]
                          }
                          currency={currency}
                          categoryName={
                            purchase.categoryId ? categoryMap[purchase.categoryId] : undefined
                          }
                          onEdit={onEditPurchase}
                          onDelete={onDeletePurchase}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
