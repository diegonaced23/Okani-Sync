"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id, Doc } from "../../../../../convex/_generated/dataModel";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react";
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
import { CardSummary } from "@/components/cards/CardSummary";
import { CardForm } from "@/components/cards/CardForm";
import { PurchaseForm } from "@/components/cards/PurchaseForm";
import { InstallmentSchedule } from "@/components/cards/InstallmentSchedule";
import { formatCents, currentMonth } from "@/lib/money";
import { toast } from "sonner";

function PurchaseRow({
  purchase,
  currency,
  onPay,
  paying,
}: {
  purchase: Doc<"cardPurchases">;
  currency: string;
  onPay: (id: Id<"cardInstallments">) => void;
  paying: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const installments = useQuery(api.cardInstallments.listByPurchase, {
    purchaseId: purchase._id,
  });

  const paidCount = purchase.paidInstallments;
  const totalCount = purchase.totalInstallments;
  const progress = totalCount > 0 ? (paidCount / totalCount) * 100 : 0;

  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-controls={`purchase-detail-${purchase._id}`}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {purchase.description}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              {paidCount}/{totalCount}
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-foreground tabular-nums">
            {formatCents(purchase.amountPerInstallment, currency)}/mes
          </p>
          {purchase.hasInterest && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              +interés
            </Badge>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {expanded && (
        <div id={`purchase-detail-${purchase._id}`} className="px-4 pb-4">
          {installments === undefined ? (
            <Skeleton className="h-32" />
          ) : (
            <InstallmentSchedule
              installments={installments}
              currency={currency}
              onPay={onPay}
              paying={paying}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default function CardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const cardId = id as Id<"cards">;
  const router = useRouter();

  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [paying, setPaying] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const card = useQuery(api.cards.getById, { cardId });
  const purchases = useQuery(api.cardPurchases.listByCard, {
    cardId,
    status: "activa",
  });
  const monthInstallments = useQuery(api.cardInstallments.listByCardMonth, {
    cardId,
    month: currentMonth(),
  });

  const payInstallment = useMutation(api.cardPurchases.payInstallment);
  const removeCard = useMutation(api.cards.remove);

  async function handlePay(installmentId: Id<"cardInstallments">) {
    setPaying(installmentId);
    try {
      await payInstallment({ installmentId });
      toast.success("Cuota pagada correctamente");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al pagar");
    } finally {
      setPaying("");
    }
  }

  function handleDelete() {
    setDeleteOpen(true);
  }

  async function executeDelete() {
    setDeleteOpen(false);
    setDeleting(true);
    try {
      await removeCard({ cardId });
      toast.success("Tarjeta eliminada");
      router.push("/tarjetas");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
      setDeleting(false);
    }
  }

  if (card === undefined) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-36 rounded-xl" />
      </div>
    );
  }

  if (!card) {
    return (
      <div className="flex flex-col items-center gap-3 py-20">
        <p className="text-muted-foreground">Tarjeta no encontrada.</p>
        <Button variant="outline" onClick={() => router.push("/tarjetas")}>
          Volver
        </Button>
      </div>
    );
  }

  const unpaidThisMonth = (monthInstallments ?? []).filter((i) => !i.paid);
  const monthlyDue = unpaidThisMonth.reduce((s, i) => s + i.amount, 0);

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Navegación + acciones */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push("/tarjetas")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Tarjetas
        </button>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => setEditOpen(true)}
            aria-label="Editar tarjeta"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-danger"
            onClick={handleDelete}
            disabled={deleting}
            aria-label="Eliminar tarjeta"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Sheet de edición */}
      <AppSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Editar tarjeta"
      >
        <CardForm card={card} onSuccess={() => setEditOpen(false)} />
      </AppSheet>

      {/* Resumen tarjeta */}
      <CardSummary card={card} />

      {/* Cuotas de este mes */}
      {unpaidThisMonth.length > 0 && (
        <div className="rounded-xl bg-warning/10 border border-warning/20 p-4">
          <p className="text-sm font-semibold text-warning">
            Este mes debes pagar {formatCents(monthlyDue, card.currency)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {unpaidThisMonth.length} cuota{unpaidThisMonth.length > 1 ? "s" : ""} pendiente
            {unpaidThisMonth.length > 1 ? "s" : ""}
          </p>
        </div>
      )}

      {/* Compras activas */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Compras activas ({(purchases ?? []).length})
          </h2>
          <AppSheet
            open={purchaseOpen}
            onOpenChange={setPurchaseOpen}
            title={`Nueva compra — ${card.name}`}
            trigger={<Button size="sm" variant="outline" className="gap-1.5 h-8"><Plus className="h-3.5 w-3.5" /> Nueva compra</Button>}
          >
            <PurchaseForm
              cardId={cardId}
              defaultInterestRate={card.interestRate}
              currency={card.currency}
              onSuccess={() => setPurchaseOpen(false)}
            />
          </AppSheet>
        </div>

        {purchases === undefined ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        ) : purchases.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center rounded-xl bg-card border border-border">
            No hay compras activas en esta tarjeta.
          </p>
        ) : (
          <div className="rounded-xl bg-card border border-border overflow-hidden">
            {purchases.map((purchase) => (
              <PurchaseRow
                key={purchase._id}
                purchase={purchase}
                currency={card.currency}
                onPay={handlePay}
                paying={paying}
              />
            ))}
          </div>
        )}
      </section>

      {/* Diálogo de confirmación eliminar */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar tarjeta</AlertDialogTitle>
            <AlertDialogDescription>
              {(purchases ?? []).length > 0
                ? "Se eliminarán también todas sus compras, cuotas y transacciones registradas. Esta acción no se puede deshacer."
                : "Esta acción no se puede deshacer."}
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
