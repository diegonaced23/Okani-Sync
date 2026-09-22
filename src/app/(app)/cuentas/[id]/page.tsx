"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Receipt, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { PageContainer } from "@/components/layout/PageContainer";
import { MonthStepper } from "@/components/ui/month-stepper";
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
import { AccountHero } from "@/components/accounts/AccountHero";
import { AccountSheet } from "@/components/accounts/AccountSheet";
import { BalanceSheet } from "@/components/accounts/BalanceSheet";
import { ShareSheet } from "@/components/accounts/ShareSheet";
import { SharesList, type Share } from "@/components/accounts/SharesList";
import { EASE_OUT_EXPO, GLASS_SURFACE, haptic } from "@/components/accounts/shared";
import { TransactionItem } from "@/components/transactions/TransactionItem";
import { TX_TYPE_CONFIG } from "@/components/transactions/tx-type-config";
import { currentMonth, formatCents, formatMonth } from "@/lib/money";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/errorMessage";

export default function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const accountId = id as Id<"accounts">;
  const router = useRouter();
  const reduce = useReducedMotion();

  const [month, setMonth] = useState(() => currentMonth());
  const [shareOpen, setShareOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const me = useQuery(api.users.getMe);
  const account = useQuery(api.accounts.getById, { accountId });
  const shares = useQuery(api.accountShares.listForAccount, { accountId });
  const transactions = useQuery(api.transactions.listByAccountMonth, { accountId, month });
  const categories = useQuery(api.categories.list, {});

  const setArchived = useMutation(api.accounts.setArchived);
  const removeAccount = useMutation(api.accounts.remove);

  const catMap = useMemo(
    () => Object.fromEntries((categories ?? []).map((c) => [c._id, c.name])),
    [categories]
  );

  // Totales del mes. La dirección de cada tipo la da `TX_TYPE_CONFIG.sign`, la
  // misma fuente que usa la fila para pintar el signo: así un pago de tarjeta o un
  // préstamo otorgado cuentan como salida, en vez de quedar fuera del resumen.
  // Las transferencias son dos filas de doble entrada: cuentan como movimiento
  // pero no como entrada ni salida del mes, así que van aparte.
  const monthTotals = useMemo(() => {
    let income = 0;
    let expense = 0;
    let transfers = 0;
    for (const tx of transactions ?? []) {
      if (tx.transferGroupId) {
        transfers += 1;
        continue;
      }
      const sign = TX_TYPE_CONFIG[tx.type]?.sign;
      if (sign === "+") income += tx.amount;
      else if (sign === "−") expense += tx.amount;
    }
    return { income, expense, transfers };
  }, [transactions]);

  // Comparar contra me.clerkId (no un id de sesión crudo): bajo Better Auth el
  // id de la sesión del cliente es el authId, no el clerkId que guarda
  // account.ownerId — ver docs/migracion-better-auth.md.
  const isOwner = account?.ownerId === me?.clerkId;
  const isLoading = account === undefined;

  // Cuando la cuenta deja de existir (eliminada reactivamente por Convex),
  // navegamos en un efecto — nunca durante una renderización en curso —
  // para evitar el crash de PWA "This page couldn't load".
  useEffect(() => {
    if (!isLoading && account === null) {
      router.replace("/productos?tab=cuentas");
    }
  }, [isLoading, account, router]);

  if (!isLoading && account === null) return null;

  async function handleArchive() {
    if (!account) return;
    haptic(15);
    try {
      await setArchived({ accountId, archived: true });
      toast(`«${account.name}» archivada`, {
        action: {
          label: "Deshacer",
          onClick: () => {
            setArchived({ accountId, archived: false }).catch(() =>
              toast.error("No se pudo deshacer")
            );
          },
        },
      });
      router.replace("/productos?tab=cuentas");
    } catch (err) {
      toast.error(errorMessage(err, "No se pudo archivar"));
    }
  }

  async function handleDelete() {
    setConfirmDelete(false);
    setDeleting(true);
    try {
      await removeAccount({ accountId });
      toast.success("Cuenta eliminada");
      // La navegación la maneja el efecto cuando `account` pasa a null
    } catch (err) {
      toast.error(errorMessage(err, "No se pudo eliminar"));
      setDeleting(false);
    }
  }

  const visibleShares = (shares ?? []) as Share[];

  return (
    <PageContainer className="space-y-5">
      <button
        type="button"
        onClick={() => router.push("/productos?tab=cuentas")}
        className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Mis productos
      </button>

      {isLoading || !account ? (
        <>
          <Skeleton className="h-[248px] rounded-[28px]" />
          <Skeleton className="h-[48px] rounded-[18px]" />
          <div className={cn("space-y-1.5 rounded-[24px] p-2", GLASS_SURFACE)}>
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-[16px]" />)}
          </div>
        </>
      ) : (
        <>
          <AccountHero
            account={account}
            isOwner={isOwner}
            onShare={() => setShareOpen(true)}
            onEdit={() => setEditOpen(true)}
            onAdjust={() => setBalanceOpen(true)}
            onArchive={handleArchive}
          />

          {/* Con quién está compartida */}
          {isOwner && visibleShares.length > 0 && (
            <section className="space-y-2" aria-label="Compartida con">
              <h2 className="px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Compartida con
              </h2>
              <div className={cn("rounded-[24px] p-1.5", GLASS_SURFACE)}>
                <SharesList shares={visibleShares} />
              </div>
              <p className="px-1 text-center text-xs text-muted-foreground/80">
                Desliza para cambiar el nivel de acceso o revocarlo.
              </p>
            </section>
          )}

          {/* Movimientos del mes */}
          <section className="space-y-2" aria-label="Movimientos">
            <h2 className="px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              Movimientos
            </h2>

            <MonthStepper month={month} onChange={setMonth} />

            {/* Resumen del mes: antes había que sumar la lista a ojo */}
            {transactions !== undefined && transactions.length > 0 && (
              <motion.div
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
                className="grid grid-cols-2 gap-2"
              >
                <Stat
                  label="Entró"
                  value={`+${formatCents(monthTotals.income, account.currency)}`}
                  tone="var(--os-lime-text)"
                />
                <Stat
                  label="Salió"
                  value={`−${formatCents(monthTotals.expense, account.currency)}`}
                  tone="var(--os-magenta)"
                />
              </motion.div>
            )}

            <div className={cn("overflow-hidden rounded-[24px]", GLASS_SURFACE)}>
              {transactions === undefined ? (
                <div className="space-y-2 p-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-[16px]" />)}
                </div>
              ) : transactions.length === 0 ? (
                <p className="flex items-center justify-center gap-2 px-6 py-10 text-center text-sm text-muted-foreground">
                  <Receipt className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Sin movimientos en {formatMonth(month).toLowerCase()}.
                </p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {transactions.map((tx, i) => (
                    <motion.li
                      key={tx._id}
                      initial={reduce ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: EASE_OUT_EXPO, delay: Math.min(i, 10) * 0.03 }}
                    >
                      <TransactionItem
                        transaction={tx}
                        categoryName={tx.categoryId ? catMap[tx.categoryId] : undefined}
                      />
                    </motion.li>
                  ))}
                </ul>
              )}
            </div>

            {monthTotals.transfers > 0 && (
              <p className="px-1 text-xs text-muted-foreground/80">
                {monthTotals.transfers === 1
                  ? "1 transferencia del mes no cuenta como ingreso ni gasto."
                  : `${monthTotals.transfers} transferencias del mes no cuentan como ingreso ni gasto.`}
              </p>
            )}
          </section>

          {/* Zona de riesgo: eliminar no va con el resto de acciones */}
          {isOwner && !account.isDefault && (
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
                Eliminar esta cuenta
              </button>
              <p className="px-1 text-center text-xs text-muted-foreground">
                Archivar la saca del listado y conserva el historial. Eliminar no se puede deshacer.
              </p>
            </section>
          )}

          {/* ── Hojas ──────────────────────────────────────────────────── */}
          <AccountSheet open={editOpen} onOpenChange={setEditOpen} account={account} />

          {isOwner && (
            <>
              <BalanceSheet account={account} open={balanceOpen} onOpenChange={setBalanceOpen} />
              <ShareSheet
                accountId={accountId}
                accountName={account.name}
                open={shareOpen}
                onOpenChange={setShareOpen}
              />
            </>
          )}

          <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Eliminar «{account.name}»</AlertDialogTitle>
                <AlertDialogDescription>
                  {(transactions ?? []).length > 0
                    ? "Se eliminarán también todas sus transacciones y registros asociados. Esta acción no se puede deshacer."
                    : "Esta acción no se puede deshacer. Si solo quieres sacarla del listado, archívala."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel />
                <AlertDialogAction onClick={handleDelete} disabled={deleting}>
                  Eliminar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </PageContainer>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={cn("rounded-[18px] px-3 py-2.5", GLASS_SURFACE)}>
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate font-mono-num text-[15px] font-bold tabular-nums" style={{ color: tone }}>
        {value}
      </p>
    </div>
  );
}
