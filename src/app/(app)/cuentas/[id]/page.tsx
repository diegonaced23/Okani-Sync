"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import {
  ArrowLeft, Share2, UserMinus, Archive, ChevronLeft, ChevronRight,
  Pencil, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
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
import { ShareAccountDialog } from "@/components/accounts/ShareAccountDialog";
import { AccountForm } from "@/components/accounts/AccountForm";
import { TransactionItem } from "@/components/transactions/TransactionItem";
import { formatCents, currentMonth, formatMonth } from "@/lib/money";
import { toast } from "sonner";

function shiftMonth(m: string, delta: number) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const accountId = id as Id<"accounts">;
  const router = useRouter();
  const { user: clerkUser } = useUser();

  const [month, setMonth] = useState(() => currentMonth());
  const [shareOpen, setShareOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pendingAction, setPendingAction] = useState<"archive" | "delete" | null>(null);

  const account = useQuery(api.accounts.getById, { accountId });
  const shares = useQuery(api.accountShares.listForAccount, { accountId });
  const transactions = useQuery(api.transactions.listByAccountMonth, {
    accountId,
    month,
  });
  const categories = useQuery(api.categories.list, {});

  const revokeShare = useMutation(api.accountShares.revoke);
  const archiveAccount = useMutation(api.accounts.archive);
  const removeAccount = useMutation(api.accounts.remove);

  const catMap = Object.fromEntries(
    (categories ?? []).map((c) => [c._id, c.name])
  );

  const isOwner = account?.ownerId === clerkUser?.id;
  const isLoading = account === undefined;

  // Cuando la cuenta deja de existir (eliminada reactivamente por Convex),
  // navegamos en un efecto — nunca durante una renderización en curso —
  // para evitar el crash de PWA "This page couldn't load".
  useEffect(() => {
    if (!isLoading && account === null) {
      router.replace("/cuentas");
    }
  }, [isLoading, account, router]);

  if (!isLoading && account === null) {
    return null;
  }

  async function handleRevoke(shareId: Id<"accountShares">) {
    try {
      await revokeShare({ shareId });
      toast.success("Acceso revocado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  }

  function handleArchive() {
    setPendingAction("archive");
  }

  function handleDelete() {
    setPendingAction("delete");
  }

  async function executeAction() {
    setPendingAction(null);
    if (pendingAction === "archive") {
      try {
        await archiveAccount({ accountId });
        toast.success("Cuenta archivada");
        router.replace("/cuentas");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error");
      }
    } else if (pendingAction === "delete") {
      setDeleting(true);
      try {
        await removeAccount({ accountId });
        toast.success("Cuenta eliminada");
        // La navegación la maneja el useEffect cuando account pasa a null
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al eliminar");
        setDeleting(false);
      }
    }
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Navegación */}
      <button
        type="button"
        onClick={() => router.push("/cuentas")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Cuentas
      </button>

      {/* Header cuenta */}
      {isLoading ? (
        <Skeleton className="h-28 rounded-xl" />
      ) : (
        <div className="rounded-xl bg-card border border-border p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-foreground">{account!.name}</h1>
                {account!.isShared && (
                  <Badge variant="secondary" className="text-xs">Compartida</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {account!.bankName ?? account!.type} ·{" "}
                {account!.accountNumber && `···${account!.accountNumber} · `}
                {account!.currency}
              </p>
            </div>
            <div className="text-right">
              <p className={`text-2xl font-bold tabular-nums ${account!.balance < 0 ? "text-danger" : "text-foreground"}`}>
                {formatCents(account!.balance, account!.currency)}
              </p>
              <p className="text-xs text-muted-foreground">saldo actual</p>
            </div>
          </div>

          {isOwner && (
            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setShareOpen(true)}
              >
                <Share2 className="h-3.5 w-3.5" />
                Compartir
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </Button>
              {!account!.isDefault && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-muted-foreground"
                    onClick={handleArchive}
                  >
                    <Archive className="h-3.5 w-3.5" />
                    Archivar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-danger hover:text-danger"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Eliminar
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Sheet de edición */}
      {!isLoading && account && (
        <AppSheet
          open={editOpen}
          onOpenChange={setEditOpen}
          title="Editar cuenta"
        >
          <AccountForm account={account} onSuccess={() => setEditOpen(false)} />
        </AppSheet>
      )}

      {/* Sección "Compartida con" */}
      {isOwner && (shares ?? []).length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Compartida con
          </h2>
          <div className="rounded-xl bg-card border border-border overflow-hidden">
            <ul className="divide-y divide-border">
              {shares!.map((share) => (
                <li key={share._id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {share.userName ?? share.userEmail ?? share.sharedWithUserId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {share.permission} · {share.status}
                    </p>
                  </div>
                  {share.status === "aceptada" && (
                    <button
                      type="button"
                      onClick={() => handleRevoke(share._id)}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-danger transition-colors"
                      aria-label="Revocar acceso"
                    >
                      <UserMinus className="h-4 w-4" />
                    </button>
                  )}
                  {share.status === "pendiente" && (
                    <Badge variant="outline" className="text-[10px]">Pendiente</Badge>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <Separator />

      {/* Transacciones del mes */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Movimientos
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMonth((m) => shiftMonth(m, -1))}
              className="p-1 rounded hover:bg-muted transition-colors"
              aria-label="Mes anterior"
            >
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            </button>
            <span className="text-xs font-medium text-muted-foreground w-24 text-center capitalize">
              {formatMonth(month)}
            </span>
            <button
              type="button"
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
              disabled={month >= currentMonth()}
              className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-30"
              aria-label="Mes siguiente"
            >
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="rounded-xl bg-card border border-border overflow-hidden">
          {transactions === undefined ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
            </div>
          ) : transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">
              Sin movimientos en {formatMonth(month).toLowerCase()}.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {transactions.map((tx) => (
                <li key={tx._id}>
                  <TransactionItem
                    transaction={tx}
                    categoryName={tx.categoryId ? catMap[tx.categoryId] : undefined}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Diálogo compartir */}
      {!isLoading && (
        <ShareAccountDialog
          accountId={accountId}
          open={shareOpen}
          onOpenChange={setShareOpen}
        />
      )}

      {/* Diálogo de confirmación archivar/eliminar */}
      <AlertDialog
        open={pendingAction !== null}
        onOpenChange={(open) => { if (!open) setPendingAction(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction === "archive" ? "Archivar cuenta" : "Eliminar cuenta"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction === "archive"
                ? "El historial se conserva y podrás recuperarla más adelante."
                : (transactions ?? []).length > 0
                  ? "Se eliminarán también todas sus transacciones y registros asociados. Esta acción no se puede deshacer."
                  : "Esta acción no se puede deshacer."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction onClick={executeAction} disabled={deleting}>
              {pendingAction === "archive" ? "Archivar" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
