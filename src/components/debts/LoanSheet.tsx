"use client";

import { useId, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Archive, ArchiveRestore, Check, Loader2, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AppSheet, AppSheetFooter } from "@/components/ui/app-sheet";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { ColorPicker } from "@/components/ui/color-picker";
import { Segmented } from "@/components/ui/segmented";
import { SourceChip } from "@/components/ui/source-chip";
import { HoldToConfirmButton } from "@/components/ui/hold-to-confirm-button";
import { ACCOUNT_COLORS, CURRENCIES } from "@/lib/constants";
import { FIELD_LABEL, OVERFLOW_ROW, haptic, tint } from "@/lib/ios";
import { dateStrToTs, formatCents, fromCents, toCents, todayStr, tsToDateStr } from "@/lib/money";
import { cn } from "@/lib/utils";
import { initialOf, type Loan } from "./shared";
import { errorMessage } from "@/lib/errorMessage";
import { buildLoanCreatedConfirmation, buildObligationEditConfirmation } from "@/lib/obligationConfirmation";
import { showConfirmation } from "@/components/ui/confirmation-capsule";

export function LoanSheet({
  open,
  onOpenChange,
  loan,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = crear */
  loan: Loan | null;
  onDeleted?: () => void;
}) {
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession((s) => s + 1);
  }
  return (
    <AppSheet open={open} onOpenChange={onOpenChange} title={loan ? "Editar préstamo" : "Nuevo préstamo"} footer>
      <LoanForm
        key={`${loan?._id ?? "new"}-${session}`}
        loan={loan}
        onDone={() => onOpenChange(false)}
        onDeleted={() => { onOpenChange(false); onDeleted?.(); }}
      />
    </AppSheet>
  );
}

function LoanForm({ loan, onDone, onDeleted }: { loan: Loan | null; onDone: () => void; onDeleted: () => void }) {
  const formId = useId();
  const reduce = useReducedMotion();
  const accounts = useQuery(api.accounts.list);
  const createLoan = useMutation(api.loans.create);
  const updateLoan = useMutation(api.loans.update);
  const setArchived = useMutation(api.loans.setArchived);
  const removeLoan = useMutation(api.loans.remove);
  const isEdit = loan !== null;

  const [borrower, setBorrower] = useState(loan?.borrower ?? "");
  const [name, setName] = useState(loan?.name ?? "");
  const [amount, setAmount] = useState(loan ? String(fromCents(loan.originalAmount)) : "");
  const [currency, setCurrency] = useState(loan?.currency ?? "COP");
  const [accountId, setAccountId] = useState<Id<"accounts"> | null>(null);
  const [startDate, setStartDate] = useState(loan ? tsToDateStr(loan.startDate) : todayStr());
  const [dueDate, setDueDate] = useState(loan?.dueDate ? tsToDateStr(loan.dueDate) : "");
  const [color, setColor] = useState(loan?.color ?? ACCOUNT_COLORS[1]);
  const [notes, setNotes] = useState(loan?.notes ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "done">("idle");
  const [busy, setBusy] = useState(false);

  const cents = amount ? toCents(parseFloat(amount)) : 0;
  const sameCurrency = (accounts ?? []).filter((a) => a.currency === currency);
  const selectedAccount = sameCurrency.find((a) => a._id === accountId);
  const canSubmit = borrower.trim().length > 0 && (isEdit || cents > 0) && status === "idle";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus("saving");
    // Sin concepto, el préstamo se llama como la persona
    const loanName = name.trim() || `Préstamo a ${borrower.trim()}`;
    try {
      if (isEdit) {
        const clear: ("dueDate" | "notes")[] = [];
        if (!dueDate && loan.dueDate !== undefined) clear.push("dueDate");
        if (!notes.trim() && loan.notes) clear.push("notes");
        await updateLoan({
          loanId: loan._id,
          name: loanName,
          borrower: borrower.trim(),
          color,
          ...(dueDate ? { dueDate: dateStrToTs(dueDate) } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          ...(clear.length ? { clear } : {}),
        });
      } else {
        await createLoan({
          name: loanName,
          borrower: borrower.trim(),
          originalAmount: cents,
          currency,
          startDate: dateStrToTs(startDate),
          dueDate: dueDate ? dateStrToTs(dueDate) : undefined,
          fromAccountId: selectedAccount?._id,
          color,
          icon: "hand-coins",
          notes: notes.trim() || undefined,
        });
      }
      haptic(12);
      setStatus("done");
      showConfirmation(
        isEdit
          ? buildObligationEditConfirmation(loanName)
          : buildLoanCreatedConfirmation({ borrower, amountCents: cents, currency, accountName: selectedAccount?.name }),
      );
      setTimeout(onDone, reduce ? 0 : 520);
    } catch (err) {
      setStatus("idle");
      toast.error(isEdit ? "No se pudieron guardar los cambios" : "No se pudo registrar el préstamo", {
        description: errorMessage(err, "Revisa tu conexión e inténtalo de nuevo."),
      });
    }
  }

  async function toggleArchive() {
    if (!loan) return;
    setBusy(true);
    try {
      await setArchived({ loanId: loan._id, archived: !loan.archived });
      toast.success(loan.archived ? "Préstamo restaurado" : "Préstamo archivado", {
        description: loan.archived ? `«${loan.name}» vuelve a tu lista` : `«${loan.name}» queda guardado en Archivados`,
      });
      onDone();
    } catch (err) {
      toast.error(loan.archived ? "No se pudo restaurar el préstamo" : "No se pudo archivar el préstamo", {
        description: errorMessage(err, "Inténtalo de nuevo en un momento."),
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!loan) return;
    setBusy(true);
    try {
      await removeLoan({ loanId: loan._id });
      toast.success("Préstamo eliminado", { description: `«${loan.name}» y sus cobros se borraron` });
      onDeleted();
    } catch (err) {
      toast.error("No se pudo eliminar el préstamo", {
        description: errorMessage(err, "Inténtalo de nuevo en un momento."),
      });
      setBusy(false);
    }
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-6">
      {/* Vista previa: la persona y el monto */}
      <div
        className="relative overflow-hidden rounded-[24px] border border-white/40 px-4 pb-4 pt-5 text-center dark:border-white/10"
        style={{ background: `linear-gradient(160deg, ${tint(color, 16)}, transparent 70%)` }}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-10 left-1/2 h-28 w-40 -translate-x-1/2 rounded-full blur-3xl transition-[background-color] duration-500"
          style={{ backgroundColor: tint(color, 40) }}
        />
        <div className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-full text-lg font-extrabold transition-colors duration-300"
          style={{ background: tint(color, 22), color, boxShadow: `0 8px 20px -10px ${tint(color, 80)}` }}
          aria-hidden="true"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={initialOf(borrower)}
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ type: "spring", stiffness: 600, damping: 24 }}
            >
              {borrower.trim() ? initialOf(borrower) : "?"}
            </motion.span>
          </AnimatePresence>
        </div>
        <p className={cn("relative mt-2 truncate text-sm font-semibold", borrower.trim() ? "text-foreground" : "text-muted-foreground/60")}>
          {borrower.trim() ? `Le prestas a ${borrower.trim()}` : "¿A quién le prestas?"}
        </p>

        {isEdit ? (
          <div className="relative mt-1">
            <p className="font-mono-num text-[34px] font-extrabold tracking-tight text-foreground">
              {formatCents(loan.currentBalance, loan.currency)}
            </p>
            <p className="text-xs text-muted-foreground">
              Pendiente de {formatCents(loan.originalAmount, loan.currency)} · el monto no se edita
            </p>
          </div>
        ) : (
          <>
            <label htmlFor={`${formId}-amount`} className="sr-only">Monto prestado</label>
            <div className="relative mt-1 flex items-baseline justify-center gap-1.5">
              <MoneyInput
                id={`${formId}-amount`}
                value={amount}
                onChange={setAmount}
                placeholder="0"
                inputMode="decimal"
                className="h-auto w-full max-w-[14rem] border-none bg-transparent p-0 text-center font-mono-num shadow-none focus-visible:ring-0"
                style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em" }}
              />
              <span className="rounded-full bg-background/60 px-2 py-0.5 text-[11px] font-bold text-muted-foreground">{currency}</span>
            </div>
          </>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor={`${formId}-borrower`} className={FIELD_LABEL}>Persona</label>
        <Input
          id={`${formId}-borrower`}
          value={borrower}
          onChange={(e) => setBorrower(e.target.value)}
          placeholder="¿Quién te debe?"
          maxLength={100}
          autoComplete="off"
          className="h-11 rounded-[14px] text-base"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor={`${formId}-name`} className={FIELD_LABEL}>Concepto</label>
        <Input
          id={`${formId}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Opcional, ej: Para el arriendo"
          maxLength={100}
          autoComplete="off"
          className="h-11 rounded-[14px] text-base"
        />
      </div>

      {!isEdit && (
        <>
          <div className="space-y-2">
            <span className={FIELD_LABEL}>Moneda</span>
            <Segmented
              label="Moneda"
              value={currency}
              onChange={(c) => { haptic(); setCurrency(c); setAccountId(null); }}
              options={CURRENCIES.map((c) => ({ value: c.code, label: c.code }))}
              small
            />
          </div>

          <div className="space-y-2">
            <span className={FIELD_LABEL}>Sale de</span>
            <div role="radiogroup" aria-label="Cuenta de origen" className={OVERFLOW_ROW}>
              <button
                type="button"
                role="radio"
                aria-checked={accountId === null}
                onClick={() => { haptic(); setAccountId(null); }}
                className={cn(
                  "flex shrink-0 items-center rounded-[14px] border px-3 py-2 text-[13px] font-semibold transition-[background-color,border-color,transform] active:scale-95",
                  accountId === null ? "border-foreground/30 bg-muted text-foreground" : "border-border bg-[var(--surface-2)] text-muted-foreground",
                )}
              >
                Ninguna cuenta
              </button>
              {sameCurrency.map((a) => (
                <SourceChip
                  key={a._id}
                  selected={accountId === a._id}
                  onSelect={() => { haptic(); setAccountId(a._id); }}
                  color={a.color}
                  name={a.name}
                  detail={formatCents(a.balance, a.currency)}
                />
              ))}
            </div>
            <p className="px-1 text-xs text-muted-foreground">
              {selectedAccount ? "Se descuenta del saldo de la cuenta." : "Solo se registra el préstamo, sin mover ninguna cuenta."}
            </p>
          </div>
        </>
      )}

      <div className={cn("grid gap-2", isEdit ? "grid-cols-1" : "grid-cols-2")}>
        {!isEdit && (
          <div className="space-y-1">
            <label htmlFor={`${formId}-start`} className={FIELD_LABEL}>Prestado el</label>
            <DatePicker id={`${formId}-start`} value={startDate} onChange={setStartDate} required className="h-11 rounded-[14px]" />
          </div>
        )}
        <div className="space-y-1">
          <label htmlFor={`${formId}-due`} className={FIELD_LABEL}>Devuelve antes de</label>
          <div className="relative">
            <DatePicker id={`${formId}-due`} value={dueDate} onChange={setDueDate} className="h-11 rounded-[14px]" />
            {dueDate && (
              <button
                type="button"
                onClick={() => setDueDate("")}
                aria-label="Quitar fecha"
                className="touch-hit absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <span className={FIELD_LABEL}>Color</span>
        <ColorPicker value={color} onChange={setColor} original={loan?.color} />
      </div>

      <div className="space-y-2">
        <label htmlFor={`${formId}-notes`} className={FIELD_LABEL}>Notas</label>
        <Textarea
          id={`${formId}-notes`}
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          placeholder="Opcional"
          className="rounded-[14px]"
        />
      </div>

      {isEdit && (
        <div className="space-y-3 border-t border-border pt-5">
          <button
            type="button"
            onClick={toggleArchive}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-muted/70 py-3 text-sm font-semibold text-foreground transition-[background-color,transform] hover:bg-muted active:scale-[0.98] disabled:opacity-50"
          >
            {loan.archived
              ? <><ArchiveRestore className="h-4 w-4" aria-hidden="true" /> Restaurar préstamo</>
              : <><Archive className="h-4 w-4" aria-hidden="true" /> Archivar préstamo</>}
          </button>
          {loan.archived ? (
            <>
              <div className="flex items-start gap-2 rounded-[14px] border border-destructive/20 bg-destructive/10 px-3 py-2.5">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                <p className="text-xs text-destructive">
                  Eliminarlo borra también sus abonos y movimientos, y revierte los saldos de tus cuentas. No se puede deshacer.
                </p>
              </div>
              <HoldToConfirmButton label="Mantén para eliminar" busyLabel="Eliminando…" busy={busy} onConfirm={handleDelete} />
            </>
          ) : (
            <p className="text-center text-xs text-muted-foreground">
              Archivado sale de la lista y de las alertas. Para eliminarlo, primero archívalo.
            </p>
          )}
        </div>
      )}

      <AppSheetFooter>
        <button
          type="submit"
          form={formId}
          disabled={!canSubmit}
          className="relative flex h-12 w-full items-center justify-center overflow-hidden rounded-[16px] bg-gradient-to-r from-emerald-400 to-teal-500 text-[15px] font-bold text-white shadow-[0_10px_24px_-10px_rgb(16_185_129/0.8)] transition-[opacity,transform] active:scale-[0.98] disabled:opacity-40"
          style={status !== "idle" ? { opacity: 1 } : undefined}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={status}
              className="flex items-center gap-2"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.9 }}
              transition={{ duration: 0.18 }}
            >
              {status === "saving" && <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Guardando…</>}
              {status === "done" && <><Check className="h-5 w-5" strokeWidth={3} aria-hidden="true" /> Listo</>}
              {status === "idle" && (isEdit ? "Guardar cambios" : "Registrar préstamo")}
            </motion.span>
          </AnimatePresence>
        </button>
      </AppSheetFooter>
    </form>
  );
}
