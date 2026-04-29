"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useState, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppSheet } from "@/components/ui/app-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { TransactionItem } from "@/components/transactions/TransactionItem";
import { TransactionForm } from "@/components/transactions/TransactionForm";
import { TransferForm } from "@/components/transactions/TransferForm";
import { currentMonth, formatMonth, formatCents } from "@/lib/money";

// ─── Virtual list ─────────────────────────────────────────────────────────────

const ITEM_HEIGHT = 65; // altura aproximada de cada TransactionItem en px

function VirtualTransactionList({
  transactions,
  catMap,
}: {
  transactions: Doc<"transactions">[];
  catMap: Record<string, string>;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: transactions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 5,
  });

  // Para listas cortas (< 30 items), renderizado normal es más fluido
  if (transactions.length < 30) {
    return (
      <ul className="divide-y divide-border">
        {transactions.map((tx) => (
          <li key={tx._id}>
            <TransactionItem
              transaction={tx}
              categoryName={tx.categoryId ? catMap[tx.categoryId] : undefined}
            />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div
      ref={parentRef}
      className="overflow-auto"
      style={{ maxHeight: "60dvh" }}
    >
      <div
        style={{ height: virtualizer.getTotalSize(), position: "relative" }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const tx = transactions[virtualRow.index];
          return (
            <div
              key={tx._id}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className="border-b border-border"
            >
              <TransactionItem
                transaction={tx}
                categoryName={tx.categoryId ? catMap[tx.categoryId] : undefined}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function shiftMonth(m: string, delta: number) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function TransaccionesPage() {
  const [month, setMonth] = useState(() => currentMonth());
  const [open, setOpen] = useState(false);
  const [txTab, setTxTab] = useState<"ingreso_gasto" | "transferencia">("ingreso_gasto");
  const listRef = useRef<HTMLDivElement>(null);

  const transactions = useQuery(api.transactions.listByMonth, { month });
  const categories = useQuery(api.categories.list, {});

  const catMap = Object.fromEntries(
    (categories ?? []).map((c) => [c._id, c.name])
  );

  const ingresos = (transactions ?? [])
    .filter((t) => t.type === "ingreso")
    .reduce((s, t) => s + t.amount, 0);
  const gastos = (transactions ?? [])
    .filter((t) => t.type === "gasto")
    .reduce((s, t) => s + t.amount, 0);

  const isLoading = transactions === undefined;

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Transacciones</h1>
        <AppSheet
          open={open}
          onOpenChange={setOpen}
          title="Nueva transacción"
          trigger={<Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Nueva</Button>}
        >
          <div className="flex rounded-lg border border-border overflow-hidden mb-4">
            {(["ingreso_gasto", "transferencia"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setTxTab(tab)}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  txTab === tab
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {tab === "ingreso_gasto" ? "Ingreso / Gasto" : "Transferencia"}
              </button>
            ))}
          </div>
          {txTab === "ingreso_gasto" ? (
            <TransactionForm onSuccess={() => setOpen(false)} />
          ) : (
            <TransferForm onSuccess={() => setOpen(false)} />
          )}
        </AppSheet>
      </div>

      {/* Selector de mes */}
      <div className="flex items-center justify-between rounded-xl bg-card border border-border px-4 py-2">
        <button
          type="button"
          onClick={() => setMonth((m) => shiftMonth(m, -1))}
          className="p-1 rounded hover:bg-muted transition-colors"
          aria-label="Mes anterior"
        >
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        </button>
        <span className="text-sm font-medium capitalize">{formatMonth(month)}</span>
        <button
          type="button"
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
          disabled={month >= currentMonth()}
          className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-30"
          aria-label="Mes siguiente"
        >
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Resumen */}
      {!isLoading && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-accent/10 border border-accent/20 p-3">
            <p className="text-xs text-muted-foreground">Ingresos</p>
            <p className="text-lg font-bold text-accent">{formatCents(ingresos, "COP")}</p>
          </div>
          <div className="rounded-xl bg-danger/10 border border-danger/20 p-3">
            <p className="text-xs text-muted-foreground">Gastos</p>
            <p className="text-lg font-bold text-danger">{formatCents(gastos, "COP")}</p>
          </div>
        </div>
      )}

      {/* Lista con virtual scroll para meses con muchas transacciones */}
      <div className="rounded-xl bg-card border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : (transactions ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground py-12 text-center">
            No hay transacciones en {formatMonth(month).toLowerCase()}.
          </p>
        ) : (
          <VirtualTransactionList
            transactions={transactions!}
            catMap={catMap}
          />
        )}
      </div>
    </div>
  );
}
