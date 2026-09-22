"use client";

import { use, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Archive, ArchiveRestore, HandCoins, Pencil } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { PageContainer } from "@/components/layout/PageContainer";
import { Skeleton } from "@/components/ui/skeleton";
import { Segmented } from "@/components/ui/segmented";
import { AmortizationTable } from "@/components/debts/AmortizationTable";
import { DebtSheet } from "@/components/debts/DebtSheet";
import { PaymentSheet } from "@/components/debts/PaymentSheet";
import { PayoffSimulator } from "@/components/debts/PayoffSimulator";
import { ActionButton, BackButton, DetailHero, PaymentHistory } from "@/components/debts/detail";
import { fromDebt } from "@/components/debts/shared";
import { EASE_OUT_EXPO, GLASS_SURFACE, haptic } from "@/lib/ios";
import { calculateLoanAmortization, currentMonth } from "@/lib/money";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/errorMessage";

type Tab = "abonos" | "plan" | "simular";

export default function DebtDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const debtId = id as Id<"debts">;
  const router = useRouter();
  const reduce = useReducedMotion();

  const debt = useQuery(api.debts.getById, { debtId });
  const payments = useQuery(api.debtPayments.listByDebt, { debtId });
  const removePayment = useMutation(api.debts.removePayment);
  const setArchived = useMutation(api.debts.setArchived);

  const [tab, setTab] = useState<Tab>("abonos");
  const [payOpen, setPayOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const amortization = useMemo(() => {
    if (!debt?.interestRate || !debt.monthlyPayment || debt.currentBalance <= 0) return null;
    return calculateLoanAmortization(debt.currentBalance, debt.interestRate, debt.monthlyPayment, currentMonth());
  }, [debt]);

  if (debt === undefined) {
    return (
      <PageContainer className="space-y-4 pb-8">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-[420px] rounded-[30px]" />
        <Skeleton className="h-16 rounded-[20px]" />
      </PageContainer>
    );
  }
  if (debt === null) {
    return (
      <PageContainer className="space-y-3 pt-16 text-center">
        <p className="text-muted-foreground">Esta deuda no existe o fue eliminada.</p>
        <button type="button" onClick={() => router.push("/deudas")} className="text-sm font-semibold text-foreground underline">
          Volver a deudas
        </button>
      </PageContainer>
    );
  }

  const o = fromDebt(debt);
  const paid = debt.status === "pagada";
  const canSimulate = !paid && debt.interestRate !== undefined && !!debt.monthlyPayment;
  const tabs: { value: Tab; label: string }[] = [
    { value: "abonos", label: "Abonos" },
    ...(amortization ? [{ value: "plan" as const, label: "Plan de pagos" }] : []),
    ...(canSimulate ? [{ value: "simular" as const, label: "Simular" }] : []),
  ];
  const activeTab = tabs.some((t) => t.value === tab) ? tab : "abonos";

  async function toggleArchive() {
    const archived = !debt!.archived;
    haptic(15);
    try {
      await setArchived({ debtId, archived });
      toast.success(archived ? "Deuda archivada" : "Deuda restaurada", {
        description: archived ? "Ya no aparece en tu lista ni en las alertas" : "Vuelve a aparecer en tu lista",
        action: {
          label: "Deshacer",
          onClick: () => { setArchived({ debtId, archived: !archived }).catch(() => toast.error("No se pudo deshacer el cambio")); },
        },
      });
    } catch (err) {
      toast.error(archived ? "No se pudo archivar la deuda" : "No se pudo restaurar la deuda", {
        description: errorMessage(err, "Inténtalo de nuevo en un momento."),
      });
    }
  }

  async function deletePayment(paymentId: string) {
    try {
      await removePayment({ paymentId: paymentId as Id<"debtPayments"> });
      haptic(15);
      toast.success("Abono borrado", { description: "El saldo pendiente se ajustó" });
    } catch (err) {
      toast.error("No se pudo borrar el abono", {
        description: errorMessage(err, "Inténtalo de nuevo en un momento."),
      });
      throw err;
    }
  }

  return (
    <PageContainer className="space-y-5 pb-8">
      <BackButton onClick={() => router.push("/deudas")} label="Deudas" />

      {debt.archived && (
        <p className={cn("rounded-[18px] px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground", GLASS_SURFACE)}>
          Archivada · no aparece en la lista ni genera alertas
        </p>
      )}

      <DetailHero o={o} startDate={debt.startDate} />

      <div className="flex items-start justify-around gap-2 px-2">
        <ActionButton icon={HandCoins} label="Abonar" primary onClick={() => setPayOpen(true)} disabled={paid || debt.archived === true} />
        <ActionButton icon={Pencil} label="Editar" onClick={() => setEditOpen(true)} />
        <ActionButton
          icon={debt.archived ? ArchiveRestore : Archive}
          label={debt.archived ? "Restaurar" : "Archivar"}
          onClick={toggleArchive}
        />
      </div>

      {tabs.length > 1 && (
        <Segmented label="Vista" value={activeTab} onChange={(t) => { haptic(); setTab(t); }} options={tabs} />
      )}

      <div className="relative">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={activeTab}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
          >
            {activeTab === "abonos" && (
              <PaymentHistory
                kind="debt"
                items={payments?.map((p) => ({ id: p._id, amount: p.amount, currency: p.currency, date: p.date, notes: p.notes }))}
                onDelete={deletePayment}
              />
            )}
            {activeTab === "plan" && amortization && (
              <AmortizationTable result={amortization} currency={debt.currency} />
            )}
            {activeTab === "simular" && canSimulate && (
              <PayoffSimulator
                balance={debt.currentBalance}
                monthlyRate={debt.interestRate!}
                payment={debt.monthlyPayment!}
                currency={debt.currency}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {debt.notes && (
        <p className={cn("whitespace-pre-line rounded-[20px] px-4 py-3 text-sm text-muted-foreground", GLASS_SURFACE)}>
          {debt.notes}
        </p>
      )}

      <PaymentSheet obligation={o} open={payOpen} onOpenChange={setPayOpen} />
      <DebtSheet open={editOpen} onOpenChange={setEditOpen} debt={debt} onDeleted={() => router.push("/deudas")} />
    </PageContainer>
  );
}
