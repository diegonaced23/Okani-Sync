"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useState } from "react";
import { Plus, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppSheet } from "@/components/ui/app-sheet";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { PillTabs } from "@/components/ui/pill-tabs";
import { DebtCard } from "@/components/debts/DebtCard";
import { DebtForm } from "@/components/debts/DebtForm";
import { DebtPaymentSheet } from "@/components/debts/DebtPaymentSheet";
import { LoanCard } from "@/components/loans/LoanCard";
import { LoanForm } from "@/components/loans/LoanForm";
import { formatCents } from "@/lib/money";
import { useRouter } from "next/navigation";

type PageTab = "deudas" | "prestamos";

const TABS: { key: PageTab; label: string }[] = [
  { key: "deudas",    label: "Deudas" },
  { key: "prestamos", label: "Préstamos" },
];

type SelectedDebt = {
  id: Id<"debts">;
  name: string;
  currentBalance: number;
  currency: string;
  monthlyPayment?: number;
};

export default function DeudasPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<PageTab>("deudas");

  // Queries — cargadas para ambos tabs desde el inicio
  const allDebts      = useQuery(api.debts.list, {});
  const allLoans      = useQuery(api.loans.list, {});
  const archivedLoans = useQuery(api.loans.list, { archived: true });

  // State — deudas
  const [debtNewOpen, setDebtNewOpen] = useState(false);
  const [selected, setSelected]       = useState<SelectedDebt | null>(null);

  // State — préstamos
  const [loanNewOpen, setLoanNewOpen]   = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // ── Deudas
  const activeDebts  = (allDebts ?? []).filter((d) => d.status === "activa");
  const overdueDebts = (allDebts ?? []).filter((d) => d.status === "vencida");
  const paidDebts    = (allDebts ?? []).filter((d) => d.status === "pagada");
  const totalDebtBalance = [...activeDebts, ...overdueDebts].reduce((s, d) => s + d.currentBalance, 0);
  const isDebtLoading = allDebts === undefined;

  // ── Préstamos
  const activeLoans  = (allLoans ?? []).filter((l) => l.status === "activa"  && !l.archived);
  const overdueLoans = (allLoans ?? []).filter((l) => l.status === "vencida" && !l.archived);
  const paidLoans    = (allLoans ?? []).filter((l) => l.status === "pagada"  && !l.archived);
  const totalLoanBalance = [...activeLoans, ...overdueLoans].reduce((s, l) => s + l.currentBalance, 0);
  const hasAnyLoan = (allLoans ?? []).length > 0 || (archivedLoans ?? []).length > 0;
  const isLoanLoading = allLoans === undefined;

  function handleDebtClick(debt: typeof activeDebts[number]) {
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

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
            {activeTab === "deudas" ? "Deudas" : "Préstamos"}
          </h1>
          {activeTab === "deudas" && !isDebtLoading && totalDebtBalance > 0 && (
            <p className="text-sm text-muted-foreground mt-0.5">
              Total pendiente: {formatCents(totalDebtBalance, "COP")}
            </p>
          )}
          {activeTab === "prestamos" && !isLoanLoading && totalLoanBalance > 0 && (
            <p className="text-sm text-muted-foreground mt-0.5">
              Por cobrar: {formatCents(totalLoanBalance, "COP")}
            </p>
          )}
        </div>

        {/* Desktop button — cambia según tab */}
        {activeTab === "deudas" ? (
          <Button
            size="sm"
            onClick={() => setDebtNewOpen(true)}
            className="hidden md:flex gap-1.5 mt-1 bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-500 hover:to-teal-600 text-white border-0 shadow-md"
          >
            <Plus className="h-4 w-4" /> Nueva deuda
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => setLoanNewOpen(true)}
            className="hidden md:flex gap-1.5 mt-1"
            style={{
              background: "linear-gradient(135deg, var(--os-lime), var(--os-cyan))",
              color: "var(--primary-foreground)",
              border: "none",
            }}
          >
            <Plus className="h-4 w-4" /> Nuevo préstamo
          </Button>
        )}
      </div>

      {/* ── Tabs ── */}
      <PillTabs
        tabs={TABS}
        active={activeTab}
        onChange={setActiveTab}
        ariaLabel="Deudas o préstamos"
      />

      {/* ── Panel: Deudas ── */}
      {activeTab === "deudas" && (
        <div role="tabpanel" id="panel-deudas" aria-labelledby="tab-deudas" className="space-y-6">
          {isDebtLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
            </div>
          ) : (allDebts ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">
              No tienes deudas registradas.
            </p>
          ) : (
            <>
              {overdueDebts.length > 0 && (
                <section className="space-y-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-danger">
                    Vencidas ({overdueDebts.length})
                  </h2>
                  <div className="space-y-2">
                    {overdueDebts.map((d) => (
                      <DebtCard key={d._id} debt={d} onClick={() => handleDebtClick(d)} />
                    ))}
                  </div>
                </section>
              )}

              {activeDebts.length > 0 && (
                <section className="space-y-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Activas ({activeDebts.length})
                  </h2>
                  <div className="space-y-2">
                    {activeDebts.map((d) => (
                      <DebtCard key={d._id} debt={d} onClick={() => handleDebtClick(d)} />
                    ))}
                  </div>
                </section>
              )}

              {paidDebts.length > 0 && (
                <>
                  <Separator />
                  <section className="space-y-2">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      Pagadas ({paidDebts.length})
                    </h2>
                    <div className="space-y-2 opacity-60">
                      {paidDebts.map((d) => (
                        <DebtCard key={d._id} debt={d} />
                      ))}
                    </div>
                  </section>
                </>
              )}
            </>
          )}

          {/* Mobile button */}
          {!isDebtLoading && (
            <div className="md:hidden">
              <Button
                className="w-full gap-2 bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-500 hover:to-teal-600 text-white border-0 shadow-lg rounded-xl h-12 text-base font-semibold"
                onClick={() => setDebtNewOpen(true)}
              >
                <Plus className="h-5 w-5" /> Agregar deuda
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Panel: Préstamos ── */}
      {activeTab === "prestamos" && (
        <div role="tabpanel" id="panel-prestamos" aria-labelledby="tab-prestamos" className="space-y-6">
          {isLoanLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
            </div>
          ) : !hasAnyLoan ? (
            <div className="py-16 text-center space-y-3">
              <p className="text-muted-foreground text-sm">No tienes préstamos registrados.</p>
              <p className="text-xs text-muted-foreground">
                Registra cuando le prestes dinero a alguien y haz seguimiento de los abonos.
              </p>
            </div>
          ) : (
            <>
              {overdueLoans.length > 0 && (
                <section className="space-y-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-danger">
                    Vencidos ({overdueLoans.length})
                  </h2>
                  <div className="space-y-2">
                    {overdueLoans.map((l) => (
                      <LoanCard key={l._id} loan={l} onClick={() => router.push(`/prestamos/${l._id}`)} />
                    ))}
                  </div>
                </section>
              )}

              {activeLoans.length > 0 && (
                <section className="space-y-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Activos ({activeLoans.length})
                  </h2>
                  <div className="space-y-2">
                    {activeLoans.map((l) => (
                      <LoanCard key={l._id} loan={l} onClick={() => router.push(`/prestamos/${l._id}`)} />
                    ))}
                  </div>
                </section>
              )}

              {paidLoans.length > 0 && (
                <>
                  <Separator />
                  <section className="space-y-2">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      Cobrados ({paidLoans.length})
                    </h2>
                    <div className="space-y-2 opacity-60">
                      {paidLoans.map((l) => (
                        <LoanCard key={l._id} loan={l} onClick={() => router.push(`/prestamos/${l._id}`)} />
                      ))}
                    </div>
                  </section>
                </>
              )}

              {(archivedLoans ?? []).length > 0 && (
                <>
                  <Separator />
                  <section className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setShowArchived((s) => !s)}
                      className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      Archivados ({archivedLoans!.length})
                      {showArchived
                        ? <ChevronUp className="h-3.5 w-3.5" />
                        : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                    {showArchived && (
                      <div className="space-y-2 opacity-50">
                        {archivedLoans!.map((l) => (
                          <LoanCard key={l._id} loan={l} onClick={() => router.push(`/prestamos/${l._id}`)} />
                        ))}
                      </div>
                    )}
                  </section>
                </>
              )}
            </>
          )}

          {/* Mobile button */}
          {!isLoanLoading && (
            <div className="md:hidden">
              <Button
                className="w-full gap-2 rounded-xl h-12 text-base font-semibold border-0 shadow-lg"
                style={{
                  background: "linear-gradient(135deg, var(--os-lime), var(--os-cyan))",
                  color: "var(--primary-foreground)",
                }}
                onClick={() => setLoanNewOpen(true)}
              >
                <Plus className="h-5 w-5" /> Nuevo préstamo
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── AppSheets ── */}
      <AppSheet open={debtNewOpen} onOpenChange={setDebtNewOpen} title="Registrar deuda">
        <DebtForm onSuccess={() => setDebtNewOpen(false)} />
      </AppSheet>

      <AppSheet
        open={loanNewOpen}
        onOpenChange={setLoanNewOpen}
        title="Nuevo préstamo"
        description="Registra dinero que le prestas a alguien."
      >
        <LoanForm onSuccess={() => setLoanNewOpen(false)} />
      </AppSheet>

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
