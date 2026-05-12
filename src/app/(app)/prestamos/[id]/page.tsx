"use client";

import { use, useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Archive, ArchiveRestore, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AppSheet } from "@/components/ui/app-sheet";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { LoanForm } from "@/components/loans/LoanForm";
import { LoanRepaymentSheet } from "@/components/loans/LoanRepaymentSheet";
import { LoanRepaymentList } from "@/components/loans/LoanRepaymentList";
import { formatCents } from "@/lib/money";
import { formatDateShort } from "@/lib/utils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STATUS_CONFIG = {
  activa:  { label: "Activo",  variant: "secondary" as const },
  pagada:  { label: "Cobrado", variant: "outline" as const },
  vencida: { label: "Vencido", variant: "destructive" as const },
};

export default function LoanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const loanId = id as Id<"loans">;
  const router = useRouter();

  const loan = useQuery(api.loans.getById, { loanId });

  const setArchived  = useMutation(api.loans.setArchived);
  const removeLoan   = useMutation(api.loans.remove);

  const [editOpen, setEditOpen]         = useState(false);
  const [repayOpen, setRepayOpen]       = useState(false);
  const [deleteOpen, setDeleteOpen]     = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [archiving, setArchiving]       = useState(false);

  const renderNow = useState(() => Date.now())[0];
  const { overdueDays, daysLeft, collectedPercent } = useMemo(() => {
    const orig = loan?.originalAmount ?? 0;
    const curr = loan?.currentBalance ?? 0;
    const due  = loan?.dueDate;
    return {
      collectedPercent: orig > 0 ? Math.min(100, ((orig - curr) / orig) * 100) : 100,
      overdueDays: due && due < renderNow ? Math.floor((renderNow - due) / (24 * 60 * 60 * 1000)) : 0,
      daysLeft:    due && due >= renderNow ? Math.ceil((due - renderNow) / (24 * 60 * 60 * 1000)) : 0,
    };
  }, [loan?.originalAmount, loan?.currentBalance, loan?.dueDate, renderNow]);

  if (loan === undefined) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }

  if (!loan) {
    return (
      <div className="flex flex-col items-center gap-3 py-20">
        <p className="text-muted-foreground">Préstamo no encontrado.</p>
        <Button variant="outline" onClick={() => router.push("/prestamos")}>
          Volver
        </Button>
      </div>
    );
  }

  const status = STATUS_CONFIG[loan.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.activa;

  async function handleArchive() {
    setArchiving(true);
    try {
      await setArchived({ loanId, archived: !loan!.archived });
      toast.success(loan!.archived ? "Préstamo restaurado" : "Préstamo archivado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setArchiving(false);
    }
  }

  async function executeDelete() {
    setDeleteOpen(false);
    setDeleting(true);
    try {
      await removeLoan({ loanId });
      toast.success("Préstamo eliminado");
      router.push("/prestamos");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Nav + acciones */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push("/prestamos")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Préstamos
        </button>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => setEditOpen(true)}
            aria-label="Editar préstamo"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={handleArchive}
            disabled={archiving}
            aria-label={loan.archived ? "Restaurar préstamo" : "Archivar préstamo"}
          >
            {loan.archived
              ? <ArchiveRestore className="h-4 w-4" />
              : <Archive className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-danger"
            onClick={() => setDeleteOpen(true)}
            disabled={!loan.archived || deleting}
            aria-label="Eliminar préstamo"
            title={!loan.archived ? "Archiva el préstamo antes de eliminarlo" : "Eliminar"}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Sheet editar */}
      <AppSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Editar préstamo"
      >
        <LoanForm loan={loan} onSuccess={() => setEditOpen(false)} />
      </AppSheet>

      {/* Resumen */}
      <div
        className="rounded-xl border border-border p-5 space-y-4"
        style={{ background: "var(--surface)" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold"
              style={{ backgroundColor: loan.color + "22", color: loan.color }}
            >
              {loan.borrower.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="font-bold text-lg text-foreground leading-tight truncate">
                {loan.name}
              </p>
              <p className="text-sm text-muted-foreground">A: {loan.borrower}</p>
            </div>
          </div>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>

        {/* Montos */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg p-3" style={{ background: "var(--surface-2)" }}>
            <p className="text-[11px] text-muted-foreground">Pendiente de cobro</p>
            <p className={cn(
              "text-xl font-bold tabular-nums mt-0.5",
              loan.status === "vencida" ? "text-danger" : "text-foreground"
            )}>
              {formatCents(loan.currentBalance, loan.currency)}
            </p>
          </div>
          <div className="rounded-lg p-3" style={{ background: "var(--surface-2)" }}>
            <p className="text-[11px] text-muted-foreground">Monto original</p>
            <p className="text-xl font-bold tabular-nums text-foreground mt-0.5">
              {formatCents(loan.originalAmount, loan.currency)}
            </p>
          </div>
        </div>

        {/* Progreso */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Cobrado: {collectedPercent.toFixed(0)}%</span>
            <span>{formatCents(loan.originalAmount - loan.currentBalance, loan.currency)} de {formatCents(loan.originalAmount, loan.currency)}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                loan.status === "vencida" ? "bg-danger" : "bg-accent"
              )}
              style={{ width: `${collectedPercent}%` }}
            />
          </div>
        </div>

        {/* Fechas */}
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground border-t border-border pt-3">
          <span>Prestado el: {formatDateShort(loan.startDate)}</span>
          {loan.dueDate && (
            <span className={cn(loan.status === "vencida" && "text-danger font-medium")}>
              {loan.status === "vencida"
                ? `Venció hace ${overdueDays} día${overdueDays !== 1 ? "s" : ""}`
                : `Vence en ${daysLeft} día${daysLeft !== 1 ? "s" : ""} · ${formatDateShort(loan.dueDate)}`}
            </span>
          )}
        </div>

        {loan.notes && (
          <p className="text-xs text-muted-foreground border-t border-border pt-3">
            {loan.notes}
          </p>
        )}
      </div>

      {/* Callout vencido */}
      {loan.status === "vencida" && (
        <div className="rounded-xl bg-danger/10 border border-danger/20 p-4">
          <p className="text-sm font-semibold text-danger">
            Este préstamo venció hace {overdueDays} día{overdueDays !== 1 ? "s" : ""}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {loan.borrower} no ha devuelto el dinero en la fecha acordada.
          </p>
        </div>
      )}

      {/* Botón registrar abono */}
      {loan.status !== "pagada" && !loan.archived && (
        <Button
          className="w-full gap-2 rounded-xl h-12 text-base font-semibold border-0 shadow-md"
          style={{
            background: "linear-gradient(135deg, var(--os-lime), var(--os-cyan))",
            color: "var(--primary-foreground)",
          }}
          onClick={() => setRepayOpen(true)}
        >
          <Plus className="h-5 w-5" /> Registrar abono
        </Button>
      )}

      {/* Histórico de abonos */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Historial de abonos
        </h2>
        <LoanRepaymentList loanId={loanId} currency={loan.currency} />
      </section>

      {/* Sheet de abono */}
      <LoanRepaymentSheet
        loanId={loanId}
        loanName={loan.name}
        borrower={loan.borrower}
        currentBalance={loan.currentBalance}
        currency={loan.currency}
        open={repayOpen}
        onOpenChange={setRepayOpen}
      />

      {/* AlertDialog eliminar */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar préstamo</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán también todos los abonos y transacciones asociadas. Los saldos de cuentas serán revertidos. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction onClick={executeDelete} disabled={deleting}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
