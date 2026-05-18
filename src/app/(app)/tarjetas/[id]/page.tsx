"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id, Doc } from "../../../../../convex/_generated/dataModel";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Trash2, FileDown, FileText, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AppSheet } from "@/components/ui/app-sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CardStatementRow } from "@/lib/reports";
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
import { PayCardForm } from "@/components/cards/PayCardForm";
import { CardCycleTabs } from "@/components/cards/CardCycleTabs";
import { formatCents } from "@/lib/money";
import { toast } from "sonner";

// ─── Página de detalle de tarjeta ─────────────────────────────────────────────

export default function CardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const cardId = id as Id<"cards">;
  const router = useRouter();

  // ── Estado de UI (sheets y diálogos) ────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Estado para el sheet de editar compra (elevado aquí para que el diálogo
  // de confirmación de eliminación también tenga acceso a los datos)
  const [editingPurchase, setEditingPurchase] = useState<Doc<"cardPurchases"> | null>(null);
  const [purchaseDeleteId, setPurchaseDeleteId] = useState<Id<"cardPurchases"> | null>(null);
  const [purchaseDeleting, setPurchaseDeleting] = useState(false);
  // Estado del botón de descarga: null = inactivo, "pdf" | "csv" = generando
  const [downloading, setDownloading] = useState<"pdf" | "csv" | null>(null);

  // ── Queries de Convex ────────────────────────────────────────────────────────

  // Query principal: toda la data de la tarjeta en una sola subscripción.
  // Reemplaza las anteriores: getById, listByCard, listDirectByCard, listByCardMonth.
  const data = useQuery(api.cards.getCardDetailData, { cardId });

  // Categorías para el filtro del Tab "Plan completo" y para mostrar nombres
  const categories = useQuery(api.categories.list, { type: "gasto" });

  // Mapa id → nombre de categoría — se computa aquí (no depende de `data`)
  // para que los handlers de descarga puedan accederlo antes de los guards
  const categoryMap = Object.fromEntries(
    (categories ?? []).map((c) => [c._id, c.name])
  );

  // ── Mutations ────────────────────────────────────────────────────────────────
  const removeCard = useMutation(api.cards.remove);
  const deletePurchaseMut = useMutation(api.cardPurchases.deletePurchase);

  // ── Handlers ─────────────────────────────────────────────────────────────────

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

  // ── Handlers de descarga ─────────────────────────────────────────────────────

  async function handleDownloadCsv() {
    if (!data) return;
    setDownloading("csv");
    try {
      // Importar las utilidades de forma dinámica para no aumentar el bundle inicial
      const { generateCardStatementCsv, downloadCsv } = await import("@/lib/reports");
      const rows: CardStatementRow[] = data.allPurchases.map((p) => ({
        description: p.description,
        category: p.categoryId ? categoryMap[p.categoryId] ?? "" : "",
        purchaseDate: p.purchaseDate,
        paidInstallments: p.paidInstallments,
        totalInstallments: p.totalInstallments,
        amountPerInstallment: p.amountPerInstallment,
        totalAmount: p.totalAmount,
        totalWithInterest: p.totalWithInterest,
        totalInterest: p.totalInterest ?? 0,
        hasInterest: p.hasInterest,
        interestRate: p.interestRate,
        status: p.status,
        currency: p.currency,
      }));
      const csv = generateCardStatementCsv(rows);
      const month = new Date().toISOString().slice(0, 7);
      downloadCsv(csv, `extracto_${data.card.lastFourDigits}_${month}.csv`);
      toast.success("CSV descargado correctamente");
    } catch {
      toast.error("Error al generar el CSV");
    } finally {
      setDownloading(null);
    }
  }

  async function handleDownloadPdf() {
    if (!data) return;
    setDownloading("pdf");
    try {
      // Carga diferida de @react-pdf/renderer y el documento (son pesados)
      const [{ pdf }, { default: CardStatementDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/cards/CardStatementDocument"),
      ]);
      const element = (
        <CardStatementDocument
          card={data.card}
          purchases={data.allPurchases}
          categoryMap={categoryMap}
          cycle={data.cycle}
          minimumPayment={data.minimumPayment}
          totalPayment={data.totalPayment}
          hasOverdue={data.overdueCuotas.length > 0}
        />
      );
      const blob = await pdf(element).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const month = new Date().toISOString().slice(0, 7);
      link.download = `extracto_${data.card.lastFourDigits}_${month}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("PDF descargado correctamente");
    } catch {
      toast.error("Error al generar el PDF");
    } finally {
      setDownloading(null);
    }
  }

  // ── Render de carga ──────────────────────────────────────────────────────────

  if (data === undefined) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-52 rounded-2xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-10 rounded-xl" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="flex flex-col items-center gap-3 py-20">
        <p className="text-muted-foreground">Tarjeta no encontrada.</p>
        <Button variant="outline" onClick={() => router.push("/tarjetas")}>
          Volver
        </Button>
      </div>
    );
  }

  const { card, minimumPayment, currentCycleCuotas } = data;

  // ── Render principal ─────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 max-w-2xl mx-auto">

      {/* Navegación + acciones de tarjeta */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push("/tarjetas")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Tarjetas
        </button>
        <div className="flex items-center gap-1">
          {/* Descargar extracto: PDF o CSV */}
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={!!downloading}
              aria-label="Descargar extracto"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <FileDown className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {/* Descarga PDF — carga @react-pdf/renderer bajo demanda */}
              <DropdownMenuItem
                onClick={handleDownloadPdf}
                disabled={downloading === "pdf"}
                className="gap-2"
              >
                <FileText className="h-4 w-4" />
                {downloading === "pdf" ? "Generando PDF…" : "Descargar PDF"}
              </DropdownMenuItem>
              {/* Descarga CSV — usa papaparse */}
              <DropdownMenuItem
                onClick={handleDownloadCsv}
                disabled={downloading === "csv"}
                className="gap-2"
              >
                <FileSpreadsheet className="h-4 w-4" />
                {downloading === "csv" ? "Generando CSV…" : "Descargar CSV"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

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

      {/* Sheet: editar tarjeta */}
      <AppSheet open={editOpen} onOpenChange={setEditOpen} title="Editar tarjeta">
        <CardForm card={card} onSuccess={() => setEditOpen(false)} />
      </AppSheet>

      {/* Sheet: editar compra (elevado a la página para compartir con los tabs) */}
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

      {/* Sheet: pagar tarjeta */}
      <AppSheet
        open={payOpen}
        onOpenChange={(open) => { if (!open) setPayOpen(false); }}
        title={`Pagar tarjeta — ${card.name}`}
      >
        {payOpen && (
          <PayCardForm card={card} onSuccess={() => setPayOpen(false)} />
        )}
      </AppSheet>

      {/* Resumen visual de la tarjeta */}
      <CardSummary card={card} />

      {/* Bloque de saldo pendiente + botón de pago */}
      {card.currentBalance > 0 && (
        <div className="rounded-xl bg-card border border-border p-4 space-y-4">
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              Saldo pendiente
            </p>
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {formatCents(card.currentBalance, card.currency)}
            </p>
            {/* Resumen del pago mínimo del ciclo actual */}
            {currentCycleCuotas.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {currentCycleCuotas.length} cuota
                {currentCycleCuotas.length !== 1 ? "s" : ""} pendientes este ciclo
                {" · "}
                {formatCents(minimumPayment, card.currency)}
              </p>
            )}
          </div>
          <Button className="w-full" onClick={() => setPayOpen(true)}>
            Pagar tarjeta
          </Button>
        </div>
      )}

      {/* Tabs del módulo — el corazón del rediseño */}
      <CardCycleTabs
        data={data}
        currency={card.currency}
        categoryMap={categoryMap}
        categories={categories ?? []}
        card={card}
        onEditPurchase={setEditingPurchase}
        onDeletePurchase={setPurchaseDeleteId}
      />

      {/* Diálogo: eliminar tarjeta */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar tarjeta</AlertDialogTitle>
            <AlertDialogDescription>
              {data.allPurchases.length > 0
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

      {/* Diálogo: eliminar compra */}
      <AlertDialog
        open={!!purchaseDeleteId}
        onOpenChange={(open) => { if (!open) setPurchaseDeleteId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar compra</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán todas las cuotas pendientes y se revertirá la deuda correspondiente
              en la tarjeta. Los pagos ya realizados quedan en el historial.
              Esta acción no se puede deshacer.
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
    </div>
  );
}
