"use client";

import { use, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { PageContainer } from "@/components/layout/PageContainer";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CardCycleTabs } from "@/components/cards/CardCycleTabs";
import { CardHero } from "@/components/cards/CardHero";
import { CardSheet } from "@/components/cards/CardSheet";
import { PayCardSheet } from "@/components/cards/PayCardSheet";
import { PurchaseSheet } from "@/components/cards/PurchaseSheet";
import { GLASS_SURFACE, haptic, type Purchase } from "@/components/cards/shared";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/errorMessage";

export default function CardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const cardId = id as Id<"cards">;
  const router = useRouter();

  // Se fija al montar: Date.now() en el render rompería la pureza del componente
  const [nowMs] = useState(() => Date.now());

  const [editOpen, setEditOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // El estado de editar/eliminar compra vive aquí para que los tabs y los
  // diálogos compartan la misma compra seleccionada
  const [purchaseSheet, setPurchaseSheet] = useState<{ open: boolean; purchase: Purchase | null }>({ open: false, purchase: null });
  const [purchaseDeleteId, setPurchaseDeleteId] = useState<Id<"cardPurchases"> | null>(null);
  const [purchaseDeleting, setPurchaseDeleting] = useState(false);

  // Query principal: toda la data de la tarjeta en una sola subscripción
  const data = useQuery(api.cards.getCardDetailData, { cardId });
  const categories = useQuery(api.categories.list, { type: "gasto" });

  const removeCard = useMutation(api.cards.remove);
  const setArchived = useMutation(api.cards.setArchived);
  const deletePurchase = useMutation(api.cardPurchases.deletePurchase);

  const categoryMap = useMemo(
    () => Object.fromEntries((categories ?? []).map((c) => [c._id, c.name])),
    [categories]
  );

  async function handleArchive() {
    if (!data) return;
    haptic(15);
    try {
      await setArchived({ cardId, archived: true });
      toast(`«${data.card.name}» archivada`, {
        action: {
          label: "Deshacer",
          onClick: () => {
            setArchived({ cardId, archived: false }).catch(() =>
              toast.error("No se pudo deshacer")
            );
          },
        },
      });
      router.replace("/productos?tab=tarjetas");
    } catch (err) {
      toast.error(errorMessage(err, "No se pudo archivar"));
    }
  }

  async function handleDeleteCard() {
    setConfirmDelete(false);
    setDeleting(true);
    try {
      await removeCard({ cardId });
      toast.success("Tarjeta eliminada");
      router.replace("/productos?tab=tarjetas");
    } catch (err) {
      toast.error(errorMessage(err, "No se pudo eliminar"));
      setDeleting(false);
    }
  }

  async function handleDeletePurchase() {
    if (!purchaseDeleteId) return;
    setPurchaseDeleting(true);
    try {
      await deletePurchase({ purchaseId: purchaseDeleteId });
      toast.success("Compra eliminada");
      setPurchaseDeleteId(null);
    } catch (err) {
      toast.error(errorMessage(err, "No se pudo eliminar"));
    } finally {
      setPurchaseDeleting(false);
    }
  }

  const back = (
    <button
      type="button"
      onClick={() => router.push("/productos?tab=tarjetas")}
      className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Mis productos
    </button>
  );

  if (data === undefined) {
    return (
      <PageContainer className="space-y-5">
        {back}
        <Skeleton className="h-[420px] rounded-[28px]" />
        <Skeleton className="h-[46px] rounded-[18px]" />
        <div className={cn("space-y-1.5 rounded-[24px] p-2", GLASS_SURFACE)}>
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-[68px] rounded-[18px]" />)}
        </div>
      </PageContainer>
    );
  }

  if (data === null) {
    return (
      <PageContainer className="space-y-5">
        {back}
        <p className={cn("rounded-[24px] px-6 py-12 text-center text-sm text-muted-foreground", GLASS_SURFACE)}>
          Esta tarjeta ya no existe.
        </p>
      </PageContainer>
    );
  }

  const { card } = data;
  // Mismo criterio que las pestañas: la fecha límite es la del ciclo cerrado
  // mientras quede algo facturado sin pagar.
  const billed = data.overdueCuotas.length;
  const paymentTs = billed > 0 ? data.cycle.prevPaymentTs : data.cycle.nextPaymentTs;
  // Vencido = pasó el día de pago Y hay algo facturado pendiente
  const overdue = data.isPaymentOverdue && billed > 0;

  return (
    <PageContainer className="space-y-5">
      {back}

      <CardHero
        card={card}
        nowMs={nowMs}
        paymentTs={paymentTs}
        billedCount={billed}
        billedAmount={data.minimumPayment}
        currentCycleCount={data.currentCycleCuotas.length}
        isPaymentOverdue={overdue}
        onPay={() => setPayOpen(true)}
        onEdit={() => setEditOpen(true)}
        onArchive={handleArchive}
      />

      <CardCycleTabs
        data={data}
        currency={card.currency}
        categoryMap={categoryMap}
        categories={categories ?? []}
        card={card}
        onEditPurchase={(p) => setPurchaseSheet({ open: true, purchase: p })}
        onDeletePurchase={setPurchaseDeleteId}
      />

      {/* Zona de riesgo: eliminar no va con el resto de acciones */}
      <section className="space-y-2 pt-2">
        <div className="os-hairline" />
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          disabled={deleting}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-[16px] border border-border text-[15px] font-bold transition-[background-color,transform] active:scale-[0.98] disabled:opacity-40"
          style={{ color: "var(--os-magenta)" }}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Eliminar esta tarjeta
        </button>
        <p className="px-1 text-center text-xs text-muted-foreground">
          Archivarla la saca del listado y conserva el historial. Eliminar no se puede deshacer.
        </p>
      </section>

      {/* ── Hojas ────────────────────────────────────────────────────────── */}
      <CardSheet open={editOpen} onOpenChange={setEditOpen} card={card} />

      <PayCardSheet
        card={card}
        minimumPayment={data.minimumPayment}
        totalPayment={data.totalPayment}
        open={payOpen}
        onOpenChange={setPayOpen}
      />

      <PurchaseSheet
        cardId={cardId}
        cardName={card.name}
        currency={card.currency}
        defaultInterestRate={card.interestRate}
        purchase={purchaseSheet.purchase}
        open={purchaseSheet.open}
        onOpenChange={(open) => setPurchaseSheet((prev) => ({ ...prev, open }))}
      />

      {/* ── Confirmaciones ───────────────────────────────────────────────── */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar «{card.name}»</AlertDialogTitle>
            <AlertDialogDescription>
              {data.allPurchases.length > 0
                ? "Se eliminarán también todas sus compras, cuotas y transacciones registradas. Esta acción no se puede deshacer."
                : "Esta acción no se puede deshacer. Si solo quieres sacarla del listado, archívala."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction onClick={handleDeleteCard} disabled={deleting}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={purchaseDeleteId !== null}
        onOpenChange={(open) => { if (!open) setPurchaseDeleteId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar compra</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán las cuotas pendientes y se revertirá la deuda correspondiente en la
              tarjeta. Los pagos ya hechos quedan en el historial. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction onClick={handleDeletePurchase} disabled={purchaseDeleting}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
