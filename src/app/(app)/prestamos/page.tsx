"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useState } from "react";
import { Plus, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppSheet } from "@/components/ui/app-sheet";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { LoanCard } from "@/components/loans/LoanCard";
import { LoanForm } from "@/components/loans/LoanForm";
import { formatCents } from "@/lib/money";
import { useRouter } from "next/navigation";

export default function PrestamosPage() {
  const allLoans    = useQuery(api.loans.list, {});
  const archived    = useQuery(api.loans.list, { archived: true });
  const [newOpen, setNewOpen]           = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const router = useRouter();

  const active  = (allLoans ?? []).filter((l) => l.status === "activa"  && !l.archived);
  const overdue = (allLoans ?? []).filter((l) => l.status === "vencida" && !l.archived);
  const paid    = (allLoans ?? []).filter((l) => l.status === "pagada"  && !l.archived);

  const totalPending = [...active, ...overdue].reduce((s, l) => s + l.currentBalance, 0);
  const isLoading = allLoans === undefined;

  const hasAny = (allLoans ?? []).length > 0 || (archived ?? []).length > 0;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Préstamos</h1>
          {!isLoading && totalPending > 0 && (
            <p className="text-sm text-muted-foreground mt-0.5">
              Por cobrar: {formatCents(totalPending, "COP")}
            </p>
          )}
        </div>
        {/* Botón desktop */}
        <AppSheet
          open={newOpen}
          onOpenChange={setNewOpen}
          title="Nuevo préstamo"
          description="Registra dinero que le prestas a alguien."
          trigger={
            <Button
              size="sm"
              className="hidden md:flex gap-1.5"
              style={{
                background: "linear-gradient(135deg, var(--os-lime), var(--os-cyan))",
                color: "var(--primary-foreground)",
                border: "none",
              }}
            >
              <Plus className="h-4 w-4" /> Nuevo préstamo
            </Button>
          }
        >
          <LoanForm onSuccess={() => setNewOpen(false)} />
        </AppSheet>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      ) : !hasAny ? (
        <div className="py-16 text-center space-y-3">
          <p className="text-muted-foreground text-sm">No tienes préstamos registrados.</p>
          <p className="text-xs text-muted-foreground">
            Registra cuando le prestes dinero a alguien y haz seguimiento de los abonos.
          </p>
        </div>
      ) : (
        <>
          {/* Vencidos — primero */}
          {overdue.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-danger">
                Vencidos ({overdue.length})
              </h2>
              <div className="space-y-2">
                {overdue.map((l) => (
                  <LoanCard
                    key={l._id}
                    loan={l}
                    onClick={() => router.push(`/prestamos/${l._id}`)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Activos */}
          {active.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Activos ({active.length})
              </h2>
              <div className="space-y-2">
                {active.map((l) => (
                  <LoanCard
                    key={l._id}
                    loan={l}
                    onClick={() => router.push(`/prestamos/${l._id}`)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Cobrados */}
          {paid.length > 0 && (
            <>
              <Separator />
              <section className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Cobrados ({paid.length})
                </h2>
                <div className="space-y-2 opacity-60">
                  {paid.map((l) => (
                    <LoanCard
                      key={l._id}
                      loan={l}
                      onClick={() => router.push(`/prestamos/${l._id}`)}
                    />
                  ))}
                </div>
              </section>
            </>
          )}

          {/* Archivados */}
          {(archived ?? []).length > 0 && (
            <>
              <Separator />
              <section className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowArchived((s) => !s)}
                  className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Archivados ({archived!.length})
                  {showArchived
                    ? <ChevronUp className="h-3.5 w-3.5" />
                    : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                {showArchived && (
                  <div className="space-y-2 opacity-50">
                    {archived!.map((l) => (
                      <LoanCard
                        key={l._id}
                        loan={l}
                        onClick={() => router.push(`/prestamos/${l._id}`)}
                      />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}

      {/* Botón mobile */}
      {!isLoading && (
        <div className="md:hidden">
          <AppSheet
            open={newOpen}
            onOpenChange={setNewOpen}
            title="Nuevo préstamo"
            description="Registra dinero que le prestas a alguien."
            trigger={
              <Button
                className="w-full gap-2 rounded-xl h-12 text-base font-semibold border-0 shadow-lg"
                style={{
                  background: "linear-gradient(135deg, var(--os-lime), var(--os-cyan))",
                  color: "var(--primary-foreground)",
                }}
              >
                <Plus className="h-5 w-5" /> Nuevo préstamo
              </Button>
            }
          >
            <LoanForm onSuccess={() => setNewOpen(false)} />
          </AppSheet>
        </div>
      )}
    </div>
  );
}
