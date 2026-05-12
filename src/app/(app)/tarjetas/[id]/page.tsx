"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id, Doc } from "../../../../../convex/_generated/dataModel";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Plus, ChevronDown, ChevronUp,
  Pencil, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import { CardSummary } from "@/components/cards/CardSummary";
import { CardForm } from "@/components/cards/CardForm";
import { PurchaseForm } from "@/components/cards/PurchaseForm";
import { InstallmentSchedule } from "@/components/cards/InstallmentSchedule";
import { MoneyInput } from "@/components/ui/money-input";
import { DatePicker } from "@/components/ui/date-picker";
import { formatCents, currentMonth, toCents, fromCents } from "@/lib/money";
import { toast } from "sonner";

// ─── Formulario inline para editar gastos directos ───────────────────────────

function DirectTransactionEditForm({
  tx,
  onClose,
}: {
  tx: Doc<"transactions">;
  onClose: () => void;
}) {
  const updateTx = useMutation(api.transactions.update);
  const categories = useQuery(api.categories.list, { type: "gasto" });

  const [description, setDescription] = useState(tx.description);
  const [amount, setAmount] = useState(fromCents(tx.amount).toString());
  const [date, setDate] = useState(new Date(tx.date).toISOString().substring(0, 10));
  const [categoryId, setCategoryId] = useState(tx.categoryId ?? "");
  const [notes, setNotes] = useState(tx.notes ?? "");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountCents = toCents(parseFloat(amount) || 0);
    if (!description.trim() || amountCents <= 0) {
      toast.error("Completa los campos obligatorios");
      return;
    }
    setLoading(true);
    try {
      await updateTx({
        transactionId: tx._id,
        description: description.trim(),
        amount: amountCents,
        date: new Date(date).getTime(),
        categoryId: categoryId ? (categoryId as Id<"categories">) : undefined,
        notes: notes || undefined,
      });
      toast.success("Gasto actualizado");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="dtx-desc">Descripción</Label>
        <Input
          id="dtx-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="dtx-amount">Monto ({tx.currency})</Label>
          <MoneyInput id="dtx-amount" value={amount} onChange={setAmount} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dtx-date">Fecha</Label>
          <DatePicker id="dtx-date" value={date} onChange={setDate} required />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Categoría (opcional)</Label>
        <Select value={categoryId} onValueChange={(v) => setCategoryId(v ?? "")}>
          <SelectTrigger>
            <span className="flex-1 text-left text-sm truncate">
              {categoryId
                ? (categories ?? []).find((c) => c._id === categoryId)?.name ?? "Categoría"
                : <span className="text-muted-foreground">Sin categoría</span>}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Sin categoría</SelectItem>
            {(categories ?? []).map((c) => (
              <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="dtx-notes">Notas (opcional)</Label>
        <Input
          id="dtx-notes"
          placeholder="Notas adicionales…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Guardando…" : "Guardar cambios"}
      </Button>
    </form>
  );
}

// ─── Fila de compra expandible ────────────────────────────────────────────────

function PurchaseRow({
  purchase,
  currency,
  categoryName,
  onPay,
  paying,
  onEdit,
  onDelete,
}: {
  purchase: Doc<"cardPurchases">;
  currency: string;
  categoryName?: string;
  onPay: (id: Id<"cardInstallments">) => void;
  paying: string;
  onEdit: (p: Doc<"cardPurchases">) => void;
  onDelete: (id: Id<"cardPurchases">) => void;
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
      <div className="flex items-center gap-2 px-4 py-3 hover:bg-muted/40 transition-colors">
        {/* Área expandible */}
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          aria-controls={`purchase-detail-${purchase._id}`}
          className="flex-1 min-w-0 flex items-center gap-3 text-left"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {purchase.description}
            </p>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {[
                categoryName,
                new Date(purchase.purchaseDate).toLocaleDateString("es-CO", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                }),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <div className="flex items-center gap-2 mt-1">
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
          {expanded
            ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
        </button>

        {/* Acciones */}
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => onEdit(purchase)}
            aria-label="Editar compra"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-danger"
            onClick={() => onDelete(purchase._id)}
            aria-label="Eliminar compra"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

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

// ─── Página principal ─────────────────────────────────────────────────────────

export default function CardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const cardId = id as Id<"cards">;
  const router = useRouter();

  // Estado tarjeta
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [paying, setPaying] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Estado compras
  const [editingPurchase, setEditingPurchase] = useState<Doc<"cardPurchases"> | null>(null);
  const [purchaseDeleteId, setPurchaseDeleteId] = useState<Id<"cardPurchases"> | null>(null);
  const [purchaseDeleting, setPurchaseDeleting] = useState(false);

  // Estado gastos directos
  const [editingTx, setEditingTx] = useState<Doc<"transactions"> | null>(null);
  const [txDeleteId, setTxDeleteId] = useState<Id<"transactions"> | null>(null);
  const [txDeleting, setTxDeleting] = useState(false);

  const card = useQuery(api.cards.getById, { cardId });
  const purchases = useQuery(api.cardPurchases.listByCard, {
    cardId,
    status: "activa",
  });
  const directTransactions = useQuery(api.transactions.listDirectByCard, { cardId });
  const monthInstallments = useQuery(api.cardInstallments.listByCardMonth, {
    cardId,
    month: currentMonth(),
  });
  const categories = useQuery(api.categories.list, { type: "gasto" });

  const payInstallment = useMutation(api.cardPurchases.payInstallment);
  const removeCard = useMutation(api.cards.remove);
  const deletePurchaseMut = useMutation(api.cardPurchases.deletePurchase);
  const removeTx = useMutation(api.transactions.remove);

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

  async function executeDeleteCard() {
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

  async function executeDeletePurchase() {
    if (!purchaseDeleteId) return;
    setPurchaseDeleting(true);
    try {
      await deletePurchaseMut({ purchaseId: purchaseDeleteId });
      toast.success("Compra eliminada");
      setPurchaseDeleteId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setPurchaseDeleting(false);
    }
  }

  async function executeDeleteTx() {
    if (!txDeleteId) return;
    setTxDeleting(true);
    try {
      await removeTx({ transactionId: txDeleteId });
      toast.success("Gasto eliminado");
      setTxDeleteId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setTxDeleting(false);
    }
  }

  const categoryMap = Object.fromEntries(
    (categories ?? []).map((c) => [c._id, c.name])
  );

  const sortedPurchases = [...(purchases ?? [])].sort(
    (a, b) => b.purchaseDate - a.purchaseDate
  );

  const sortedTxs = [...(directTransactions ?? [])].sort(
    (a, b) => b.date - a.date
  );

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
      {/* Navegación + acciones tarjeta */}
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
            onClick={() => setDeleteOpen(true)}
            disabled={deleting}
            aria-label="Eliminar tarjeta"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Sheet editar tarjeta */}
      <AppSheet open={editOpen} onOpenChange={setEditOpen} title="Editar tarjeta">
        <CardForm card={card} onSuccess={() => setEditOpen(false)} />
      </AppSheet>

      {/* Sheet editar compra */}
      <AppSheet
        open={!!editingPurchase}
        onOpenChange={(open) => { if (!open) setEditingPurchase(null); }}
        title="Editar compra"
      >
        {editingPurchase && (
          <PurchaseForm
            cardId={cardId}
            defaultInterestRate={card.interestRate}
            currency={card.currency}
            purchase={editingPurchase}
            onSuccess={() => setEditingPurchase(null)}
          />
        )}
      </AppSheet>

      {/* Sheet editar gasto directo */}
      <AppSheet
        open={!!editingTx}
        onOpenChange={(open) => { if (!open) setEditingTx(null); }}
        title="Editar gasto"
      >
        {editingTx && (
          <DirectTransactionEditForm
            tx={editingTx}
            onClose={() => setEditingTx(null)}
          />
        )}
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
            Compras activas ({sortedPurchases.length})
          </h2>
          <AppSheet
            open={purchaseOpen}
            onOpenChange={setPurchaseOpen}
            title={`Nueva compra — ${card.name}`}
            trigger={
              <Button size="sm" variant="outline" className="gap-1.5 h-8">
                <Plus className="h-3.5 w-3.5" /> Nueva compra
              </Button>
            }
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
        ) : sortedPurchases.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center rounded-xl bg-card border border-border">
            No hay compras activas en esta tarjeta.
          </p>
        ) : (
          <div className="rounded-xl bg-card border border-border overflow-hidden">
            {sortedPurchases.map((purchase) => (
              <PurchaseRow
                key={purchase._id}
                purchase={purchase}
                currency={card.currency}
                categoryName={purchase.categoryId ? categoryMap[purchase.categoryId] : undefined}
                onPay={handlePay}
                paying={paying}
                onEdit={setEditingPurchase}
                onDelete={setPurchaseDeleteId}
              />
            ))}
          </div>
        )}
      </section>

      {/* Gastos directos */}
      {(sortedTxs.length > 0 || directTransactions === undefined) && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Gastos directos ({directTransactions === undefined ? "…" : sortedTxs.length})
          </h2>

          {directTransactions === undefined ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
            </div>
          ) : (
            <div className="rounded-xl bg-card border border-border overflow-hidden">
              {sortedTxs.map((tx) => (
                <div
                  key={tx._id}
                  className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{tx.description}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[
                        tx.categoryId ? categoryMap[tx.categoryId] : undefined,
                        new Date(tx.date).toLocaleDateString("es-CO", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        }),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums text-foreground shrink-0">
                    {formatCents(tx.amount, tx.currency)}
                  </p>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => setEditingTx(tx)}
                      aria-label="Editar gasto"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-danger"
                      onClick={() => setTxDeleteId(tx._id)}
                      aria-label="Eliminar gasto"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Diálogo eliminar tarjeta */}
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
            <AlertDialogAction onClick={executeDeleteCard} disabled={deleting}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo eliminar compra */}
      <AlertDialog
        open={!!purchaseDeleteId}
        onOpenChange={(open) => { if (!open) setPurchaseDeleteId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar compra</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán todas las cuotas pendientes y se revertirá la deuda correspondiente en la tarjeta. Los pagos ya realizados quedan en el historial. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction onClick={executeDeletePurchase} disabled={purchaseDeleting}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo eliminar gasto directo */}
      <AlertDialog
        open={!!txDeleteId}
        onOpenChange={(open) => { if (!open) setTxDeleteId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar gasto</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction onClick={executeDeleteTx} disabled={txDeleting}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
