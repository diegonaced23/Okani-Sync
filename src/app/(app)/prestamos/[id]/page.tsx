"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Archive, ArchiveRestore, HandCoins, Pencil } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { PageContainer } from "@/components/layout/PageContainer";
import { Skeleton } from "@/components/ui/skeleton";
import { LoanSheet } from "@/components/debts/LoanSheet";
import { PaymentSheet } from "@/components/debts/PaymentSheet";
import { ActionButton, BackButton, DetailHero, PaymentHistory } from "@/components/debts/detail";
import { fromLoan } from "@/components/debts/shared";
import { FIELD_LABEL, GLASS_SURFACE, haptic } from "@/lib/ios";
import { cn } from "@/lib/utils";

const BACK = "/deudas?tab=prestamos";

export default function LoanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const loanId = id as Id<"loans">;
  const router = useRouter();

  const loan = useQuery(api.loans.getById, { loanId });
  const repayments = useQuery(api.loanRepayments.listByLoan, { loanId });
  const removeRepayment = useMutation(api.loans.removeRepayment);
  const setArchived = useMutation(api.loans.setArchived);

  const [payOpen, setPayOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  if (loan === undefined) {
    return (
      <PageContainer className="space-y-4 pb-8">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-[420px] rounded-[30px]" />
        <Skeleton className="h-16 rounded-[20px]" />
      </PageContainer>
    );
  }
  if (loan === null) {
    return (
      <PageContainer className="space-y-3 pt-16 text-center">
        <p className="text-muted-foreground">Este préstamo no existe o fue eliminado.</p>
        <button type="button" onClick={() => router.push(BACK)} className="text-sm font-semibold text-foreground underline">
          Volver a préstamos
        </button>
      </PageContainer>
    );
  }

  const o = fromLoan(loan);
  const paid = loan.status === "pagada";

  async function toggleArchive() {
    const archived = !loan!.archived;
    haptic(15);
    try {
      await setArchived({ loanId, archived });
      toast(archived ? "Préstamo archivado" : "Préstamo restaurado", {
        action: {
          label: "Deshacer",
          onClick: () => { setArchived({ loanId, archived: !archived }).catch(() => toast.error("No se pudo deshacer")); },
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo archivar");
    }
  }

  async function deleteRepayment(repaymentId: string) {
    try {
      await removeRepayment({ repaymentId: repaymentId as Id<"loanRepayments"> });
      haptic(15);
      toast.success("Abono borrado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo borrar el abono");
      throw err;
    }
  }

  return (
    <PageContainer className="space-y-5 pb-8">
      <BackButton onClick={() => router.push(BACK)} label="Préstamos" />

      {loan.archived && (
        <p className={cn("rounded-[18px] px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground", GLASS_SURFACE)}>
          Archivado · no aparece en la lista ni genera alertas
        </p>
      )}

      <DetailHero o={o} startDate={loan.startDate} />

      {loan.status === "vencida" && (
        <p className="rounded-[18px] bg-[color-mix(in_oklch,var(--os-magenta)_12%,transparent)] px-4 py-3 text-sm text-[var(--os-magenta)]">
          {loan.borrower} no ha devuelto el dinero en la fecha acordada.
        </p>
      )}

      <div className="flex items-start justify-around gap-2 px-2">
        <ActionButton icon={HandCoins} label="Cobrar" primary onClick={() => setPayOpen(true)} disabled={paid || loan.archived} />
        <ActionButton icon={Pencil} label="Editar" onClick={() => setEditOpen(true)} />
        <ActionButton
          icon={loan.archived ? ArchiveRestore : Archive}
          label={loan.archived ? "Restaurar" : "Archivar"}
          onClick={toggleArchive}
        />
      </div>

      <section className="space-y-2">
        <h2 className={FIELD_LABEL}>Lo que te ha devuelto</h2>
        <PaymentHistory
          kind="loan"
          items={repayments?.map((r) => ({ id: r._id, amount: r.amount, currency: r.currency, date: r.date, notes: r.notes }))}
          onDelete={deleteRepayment}
        />
      </section>

      {loan.notes && (
        <p className={cn("whitespace-pre-line rounded-[20px] px-4 py-3 text-sm text-muted-foreground", GLASS_SURFACE)}>
          {loan.notes}
        </p>
      )}

      <PaymentSheet obligation={o} open={payOpen} onOpenChange={setPayOpen} />
      <LoanSheet open={editOpen} onOpenChange={setEditOpen} loan={loan} onDeleted={() => router.push(BACK)} />
    </PageContainer>
  );
}
