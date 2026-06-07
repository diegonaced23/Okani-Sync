"use client";

import { use, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { PillTabs } from "@/components/ui/pill-tabs";
import { DebtPaymentSheet } from "@/components/debts/DebtPaymentSheet";
import { AmortizationTable } from "@/components/debts/AmortizationTable";
import { formatCents, currentMonth, calculateLoanAmortization } from "@/lib/money";
import { formatDateShort } from "@/lib/utils";

type Tab = "resumen" | "amortizacion";

const TYPE_LABELS: Record<string, string> = {
  prestamo: "Préstamo", personal: "Personal",
  hipoteca: "Hipoteca", vehiculo: "Vehículo", otro: "Otro",
};

const STATUS_CONFIG = {
  activa:  { label: "Activa",  variant: "secondary" as const },
  pagada:  { label: "Pagada",  variant: "outline" as const },
  vencida: { label: "Vencida", variant: "destructive" as const },
};

export default function DebtDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const debtId = id as Id<"debts">;
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("resumen");
  const [payOpen, setPayOpen] = useState(false);

  const debt     = useQuery(api.debts.getById, { debtId });
  const payments = useQuery(api.debtPayments.listByDebt, { debtId });

  // Amortización — solo cuando hay tasa e importe de cuota
  const amortization = useMemo(() => {
    if (!debt?.interestRate || !debt?.monthlyPayment || debt.currentBalance <= 0) return null;
    return calculateLoanAmortization(
      debt.currentBalance,
      debt.interestRate,
      debt.monthlyPayment,
      currentMonth(),
    );
  }, [debt]);

  const hasAmortization = amortization !== null;
  const tabs: { key: Tab; label: string }[] = hasAmortization
    ? [{ key: "resumen", label: "Resumen" }, { key: "amortizacion", label: "Amortización" }]
    : [];

  if (debt === undefined) {
    return (
      <div className="max-w-2xl mx-auto space-y-4 pb-8">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (debt === null) {
    return (
      <div className="max-w-2xl mx-auto pt-16 text-center space-y-3">
        <p className="text-muted-foreground">Deuda no encontrada.</p>
        <Button variant="outline" onClick={() => router.back()}>Volver</Button>
      </div>
    );
  }

  const status = STATUS_CONFIG[debt.status];
  const paidPercent = debt.originalAmount > 0
    ? Math.min(100, ((debt.originalAmount - debt.currentBalance) / debt.originalAmount) * 100)
    : 100;

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-8">

      {/* ── Navegación ────────────────────────────────────────────────────────── */}
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} />
          Deudas
        </button>
      </div>

      {/* ── Hero ──────────────────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl p-5 space-y-4"
        style={{
          background: `linear-gradient(135deg, ${debt.color}22 0%, ${debt.color}08 100%)`,
          border: `1px solid ${debt.color}44`,
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold"
              style={{ backgroundColor: debt.color + "33", color: debt.color }}
            >
              {debt.name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-foreground truncate">{debt.name}</h1>
              <p className="text-sm text-muted-foreground">
                {debt.creditor} · {TYPE_LABELS[debt.type] ?? debt.type}
              </p>
            </div>
          </div>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>

        {/* Saldo + barra de progreso */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Saldo pendiente</span>
            <span className="font-bold text-foreground tabular-nums">
              {formatCents(debt.currentBalance, debt.currency)}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${paidPercent}%`, backgroundColor: debt.color }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Pagado {paidPercent.toFixed(0)}% · {formatCents(debt.originalAmount - debt.currentBalance, debt.currency)}</span>
            <span>de {formatCents(debt.originalAmount, debt.currency)}</span>
          </div>
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          {debt.monthlyPayment && (
            <div className="rounded-xl bg-card/60 px-3 py-2 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Cuota</p>
              <p className="text-sm font-bold tabular-nums text-foreground">
                {formatCents(debt.monthlyPayment, debt.currency)}
              </p>
            </div>
          )}
          {debt.interestRate && (
            <div className="rounded-xl bg-card/60 px-3 py-2 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Tasa</p>
              <p className="text-sm font-bold text-foreground">
                {(debt.interestRate * 100).toFixed(2)}% m.v.
              </p>
            </div>
          )}
          {debt.dueDate && (
            <div className="rounded-xl bg-card/60 px-3 py-2 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Vence</p>
              <p className={`text-sm font-bold ${debt.status === "vencida" ? "text-danger" : "text-foreground"}`}>
                {formatDateShort(debt.dueDate)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Botón de abono ─────────────────────────────────────────────────────── */}
      {debt.status !== "pagada" && (
        <Button
          className="w-full gap-2"
          onClick={() => setPayOpen(true)}
          style={{ background: "linear-gradient(135deg, var(--os-lime), var(--os-cyan))", color: "oklch(0.18 0.04 190)" }}
        >
          <Plus size={16} />
          Registrar abono
        </Button>
      )}

      {/* ── Tabs (solo si hay amortización disponible) ─────────────────────────── */}
      {hasAmortization && (
        <PillTabs
          tabs={tabs}
          active={tab}
          onChange={setTab}
          ariaLabel="Vista de deuda"
        />
      )}

      {/* ── Contenido por tab ─────────────────────────────────────────────────── */}
      {tab === "resumen" && (
        <section className="space-y-2.5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-bold text-foreground">Historial de abonos</h2>
          </div>
          <div className="rounded-xl bg-card border border-border overflow-hidden">
            {payments === undefined ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
              </div>
            ) : payments.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Sin abonos registrados.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {payments.map((p) => (
                  <li key={p._id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {new Date(p.date).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                      {p.notes && <p className="text-xs text-muted-foreground">{p.notes}</p>}
                    </div>
                    <span className="text-sm font-bold tabular-nums" style={{ color: "var(--os-lime)" }}>
                      -{formatCents(p.amount, p.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {tab === "amortizacion" && amortization && (
        <AmortizationTable result={amortization} currency={debt.currency} />
      )}

      {/* ── Sheets ─────────────────────────────────────────────────────────────── */}
      <DebtPaymentSheet
        debtId={debtId}
        debtName={debt.name}
        currentBalance={debt.currentBalance}
        currency={debt.currency}
        suggestedPayment={debt.monthlyPayment}
        open={payOpen}
        onOpenChange={setPayOpen}
      />

    </div>
  );
}
