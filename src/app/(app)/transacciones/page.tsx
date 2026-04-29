"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useState } from "react";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { TransactionItem } from "@/components/transactions/TransactionItem";
import { TransactionForm } from "@/components/transactions/TransactionForm";
import { currentMonth, formatMonth, formatCents } from "@/lib/money";
// currentMonth es una función — siempre llamarla con ()

function shiftMonth(m: string, delta: number) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function TransaccionesPage() {
  const [month, setMonth] = useState(() => currentMonth());
  const [open, setOpen] = useState(false);

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
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger render={<Button size="sm" className="gap-1.5" />}>
            <Plus className="h-4 w-4" />
            Nueva
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="max-h-[92dvh] overflow-y-auto rounded-t-xl"
          >
            <SheetHeader className="pb-4">
              <SheetTitle>Nueva transacción</SheetTitle>
            </SheetHeader>
            <TransactionForm onSuccess={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
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

      {/* Lista */}
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
          <ul className="divide-y divide-border">
            {transactions!.map((tx) => (
              <li key={tx._id}>
                <TransactionItem
                  transaction={tx}
                  categoryName={tx.categoryId ? catMap[tx.categoryId] : undefined}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
