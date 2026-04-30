"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useState, useMemo, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppSheet } from "@/components/ui/app-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { TransactionItem } from "@/components/transactions/TransactionItem";
import { TransactionForm } from "@/components/transactions/TransactionForm";
import { TransferForm } from "@/components/transactions/TransferForm";
import { currentMonth, formatCents } from "@/lib/money";

// ─── Tipos de filtro ───────────────────────────────────────────────────────────

type TxFilter = "all" | "ingreso" | "gasto" | "transferencia" | "pago_tarjeta";

const FILTER_PILLS: { key: TxFilter; label: string }[] = [
  { key: "all",            label: "Todos" },
  { key: "ingreso",        label: "Ingresos" },
  { key: "gasto",          label: "Gastos" },
  { key: "transferencia",  label: "Transfer." },
  { key: "pago_tarjeta",   label: "Tarjeta" },
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

// ─── Componente de fila separador ─────────────────────────────────────────────

function TxSeparator() {
  return <div style={{ height: 1, background: "var(--border)", margin: "0 16px" }} />;
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function TransaccionesPage() {
  const today        = currentMonth();
  const searchParams = useSearchParams();
  const router       = useRouter();

  // Leer params antes de los useState para poder inicializar desde la URL
  const nuevoParam = searchParams.get("nuevo");
  const tabParam   = searchParams.get("tab");

  const [month, setMonth]   = useState(() => today);
  const [filter, setFilter] = useState<TxFilter>("all");
  const [open, setOpen]     = useState(nuevoParam === "true");
  const [txTab, setTxTab]   = useState<"ingreso" | "gasto" | "transferencia">(() => {
    if (tabParam === "ingreso" || tabParam === "gasto" || tabParam === "transferencia") {
      return tabParam;
    }
    return "gasto";
  });

  // Limpiar URL tras leer los params (sin setState — solo side-effect de navegación)
  useEffect(() => {
    if (nuevoParam === "true") {
      router.replace("/transacciones", { scroll: false });
    }
  }, [nuevoParam, router]);

  const transactions = useQuery(api.transactions.listByMonth, { month });
  const categories   = useQuery(api.categories.list, {});

  const catMap = useMemo(
    () => Object.fromEntries((categories ?? []).map((c) => [c._id, c.name])),
    [categories]
  );

  // ── Totales del mes (independientes del filtro) ────────────────────────────
  const monthIngresos = useMemo(
    () => (transactions ?? []).filter((t) => t.type === "ingreso").reduce((s, t) => s + t.amount, 0),
    [transactions]
  );
  const monthGastos = useMemo(
    () => (transactions ?? [])
      .filter((t) => ["gasto", "pago_tarjeta", "pago_deuda"].includes(t.type))
      .reduce((s, t) => s + t.amount, 0),
    [transactions]
  );

  // ── Lista filtrada ─────────────────────────────────────────────────────────
  const filtered: Doc<"transactions">[] = useMemo(() => {
    const all = transactions ?? [];
    if (filter === "all") return all;
    return all.filter((t) => t.type === filter);
  }, [transactions, filter]);

  const totalCount    = (transactions ?? []).length;
  const filteredCount = filtered.length;
  const isFiltered    = filter !== "all";
  const currency      = "COP";

  const canGoForward  = month < today;

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
              className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              aria-label="Mes anterior"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-sm text-muted-foreground">
              {monthLabel(month)}
              {transactions !== undefined && (
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
              className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-30"
              aria-label="Mes siguiente"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Botón nueva transacción — solo visible en desktop; en mobile usa el FAB del bottom nav */}
        <AppSheet
          open={open}
          onOpenChange={setOpen}
          title="Nuevo movimiento"
          description="Registra un ingreso, gasto o transferencia."
          trigger={
            <Button
              size="sm"
              className="gap-1.5 mt-1 hidden lg:inline-flex bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-500 hover:to-teal-600 text-white border-0 shadow-md"
            >
              <Plus className="h-4 w-4" /> Nueva
            </Button>
          }
        >
          {/* Pill tabs — 3 opciones */}
          <div
            role="tablist"
            aria-label="Tipo de movimiento"
            className="flex rounded-[14px] p-1 mb-5"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          >
            {(["ingreso", "gasto", "transferencia"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                id={`tx-tab-${tab}`}
                aria-selected={txTab === tab}
                aria-controls={`tx-panel-${tab}`}
                onClick={() => setTxTab(tab)}
                className="flex-1 py-2 text-[13px] transition-all"
                style={{
                  borderRadius: 10,
                  background: txTab === tab ? "var(--surface)" : "transparent",
                  color: txTab === tab ? "var(--foreground)" : "var(--muted-foreground)",
                  fontWeight: txTab === tab ? 700 : 600,
                  boxShadow: txTab === tab ? "var(--shadow-sm)" : "none",
                  transition: "all 0.2s cubic-bezier(0.34,1.56,0.64,1)",
                }}
              >
                {tab === "ingreso" ? "Ingreso" : tab === "gasto" ? "Gasto" : "Transferir"}
              </button>
            ))}
          </div>

          <div
            role="tabpanel"
            id={`tx-panel-${txTab}`}
            aria-labelledby={`tx-tab-${txTab}`}
          >
            {txTab === "transferencia" ? (
              <TransferForm onSuccess={() => setOpen(false)} />
            ) : (
              <TransactionForm
                key={txTab}
                defaultType={txTab}
                onSuccess={() => setOpen(false)}
              />
            )}
          </div>
        </AppSheet>
      </div>

      {/* ── Stats del mes ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 pb-4">
        {transactions === undefined ? (
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
                {formatCents(monthIngresos, currency)}
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
                {formatCents(monthGastos, currency)}
              </p>
            </div>
          </>
        )}
      </div>

      {/* ── Filter pills ────────────────────────────────────────────────────── */}
      <div
        role="group"
        aria-label="Filtrar por tipo"
        className="flex gap-2 pb-4 overflow-x-auto"
        style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
      >
        {FILTER_PILLS.map(({ key, label }) => {
          const isActive = filter === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={isActive}
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
      {transactions === undefined ? (
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
      ) : filtered.length === 0 ? (
        <div
          className="rounded-xl p-12 text-center"
          style={{ background: "var(--card)", border: "1px solid var(--border)" }}
        >
          <p className="text-sm text-muted-foreground">
            {filter === "all"
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
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: "var(--card)", border: "1px solid var(--border)" }}
        >
          {filtered.map((tx, i) => (
            <div key={tx._id}>
              <TransactionItem
                transaction={tx}
                categoryName={tx.categoryId ? catMap[tx.categoryId] : undefined}
              />
              {i < filtered.length - 1 && <TxSeparator />}
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
