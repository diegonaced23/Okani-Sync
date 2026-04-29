"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppSheet } from "@/components/ui/app-sheet";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { DebtCard } from "@/components/debts/DebtCard";
import { DebtForm } from "@/components/debts/DebtForm";
import { DebtPaymentSheet } from "@/components/debts/DebtPaymentSheet";
import { formatCents } from "@/lib/money";

type SelectedDebt = {
  id: Id<"debts">;
  name: string;
  currentBalance: number;
  currency: string;
  monthlyPayment?: number;
};

export default function DeudasPage() {
  const allDebts = useQuery(api.debts.list, {});
  const [newOpen, setNewOpen] = useState(false);
  const [selected, setSelected] = useState<SelectedDebt | null>(null);

  const active  = (allDebts ?? []).filter((d) => d.status === "activa");
  const overdue = (allDebts ?? []).filter((d) => d.status === "vencida");
  const paid    = (allDebts ?? []).filter((d) => d.status === "pagada");

  const totalBalance = [...active, ...overdue].reduce((s, d) => s + d.currentBalance, 0);
  const isLoading = allDebts === undefined;

  function handleDebtClick(debt: typeof active[number]) {
    setSelected({
      id: debt._id,
      name: debt.name,
      currentBalance: debt.currentBalance,
      currency: debt.currency,
      monthlyPayment: debt.monthlyPayment,
    });
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Deudas</h1>
          {!isLoading && totalBalance > 0 && (
            <p className="text-sm text-muted-foreground mt-0.5">
              Total pendiente: {formatCents(totalBalance, "COP")}
            </p>
          )}
        </div>
        <AppSheet
          open={newOpen}
          onOpenChange={setNewOpen}
          title="Registrar deuda"
          trigger={<Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Nueva</Button>}
        >
          <DebtForm onSuccess={() => setNewOpen(false)} />
        </AppSheet>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      ) : (allDebts ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center">
          No tienes deudas registradas.
        </p>
      ) : (
        <>
          {/* Vencidas — primero */}
          {overdue.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-danger">
                Vencidas ({overdue.length})
              </h2>
              <div className="space-y-2">
                {overdue.map((d) => (
                  <DebtCard key={d._id} debt={d} onClick={() => handleDebtClick(d)} />
                ))}
              </div>
            </section>
          )}

          {/* Activas */}
          {active.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Activas ({active.length})
              </h2>
              <div className="space-y-2">
                {active.map((d) => (
                  <DebtCard key={d._id} debt={d} onClick={() => handleDebtClick(d)} />
                ))}
              </div>
            </section>
          )}

          {/* Pagadas */}
          {paid.length > 0 && (
            <>
              <Separator />
              <section className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Pagadas ({paid.length})
                </h2>
                <div className="space-y-2 opacity-60">
                  {paid.map((d) => (
                    <DebtCard key={d._id} debt={d} />
                  ))}
                </div>
              </section>
            </>
          )}
        </>
      )}

      {/* Sheet de abono */}
      {selected && (
        <DebtPaymentSheet
          debtId={selected.id}
          debtName={selected.name}
          currentBalance={selected.currentBalance}
          currency={selected.currency}
          suggestedPayment={selected.monthlyPayment}
          open={!!selected}
          onOpenChange={(open) => { if (!open) setSelected(null); }}
        />
      )}
    </div>
  );
}
