"use client";

import { useId, useState } from "react";
import { useMutation } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Archive, ArchiveRestore, Check, Loader2, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { AppSheet, AppSheetFooter } from "@/components/ui/app-sheet";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { DecimalInput } from "@/components/ui/decimal-input";
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { ColorPicker } from "@/components/ui/color-picker";
import { Segmented } from "@/components/ui/segmented";
import { HoldToConfirmButton } from "@/components/ui/hold-to-confirm-button";
import { ACCOUNT_COLORS, CURRENCIES } from "@/lib/constants";
import { FIELD_LABEL, OVERFLOW_ROW, haptic, tint } from "@/lib/ios";
import {
  calculateLoanAmortization,
  currentMonth,
  dateStrToTs,
  formatCents,
  formatMonth,
  fromCents,
  toCents,
  todayStr,
  tsToDateStr,
} from "@/lib/money";
import { cn } from "@/lib/utils";
import { DEBT_TYPE_META, DEBT_TYPE_ORDER, type Debt, type DebtType } from "./shared";

export function DebtSheet({
  open,
  onOpenChange,
  debt,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = crear */
  debt: Debt | null;
  onDeleted?: () => void;
}) {
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession((s) => s + 1);
  }
  return (
    <AppSheet open={open} onOpenChange={onOpenChange} title={debt ? "Editar deuda" : "Nueva deuda"} footer>
      <DebtForm
        key={`${debt?._id ?? "new"}-${session}`}
        debt={debt}
        onDone={() => onOpenChange(false)}
        onDeleted={() => { onOpenChange(false); onDeleted?.(); }}
      />
    </AppSheet>
  );
}

/** Cuánto falta para terminar de pagar con la cuota dada; null si la cuota no alcanza. */
export function estimatePayoff(balance: number, monthlyRate: number, payment: number) {
  if (balance <= 0 || payment <= 0) return null;
  const r = calculateLoanAmortization(balance, monthlyRate, payment, currentMonth());
  if (!r) return { covers: false as const };
  return { covers: true as const, months: r.totalPayments, interest: r.totalInterest, payoff: r.payoffDate };
}

function DebtForm({
  debt,
  onDone,
  onDeleted,
}: {
  debt: Debt | null;
  onDone: () => void;
  onDeleted: () => void;
}) {
  const formId = useId();
  const reduce = useReducedMotion();
  const createDebt = useMutation(api.debts.create);
  const updateDebt = useMutation(api.debts.update);
  const setArchived = useMutation(api.debts.setArchived);
  const removeDebt = useMutation(api.debts.remove);
  const isEdit = debt !== null;

  const [name, setName] = useState(debt?.name ?? "");
  const [creditor, setCreditor] = useState(debt?.creditor ?? "");
  const [type, setType] = useState<DebtType>(debt?.type ?? "prestamo");
  const [amount, setAmount] = useState(debt ? String(fromCents(debt.originalAmount)) : "");
  const [currency, setCurrency] = useState(debt?.currency ?? "COP");
  const [rate, setRate] = useState(debt?.interestRate !== undefined ? String(+(debt.interestRate * 100).toFixed(4)) : "");
  const [payment, setPayment] = useState(debt?.monthlyPayment ? String(fromCents(debt.monthlyPayment)) : "");
  const [startDate, setStartDate] = useState(debt ? tsToDateStr(debt.startDate) : todayStr());
  const [dueDate, setDueDate] = useState(debt?.dueDate ? tsToDateStr(debt.dueDate) : "");
  const [color, setColor] = useState(debt?.color ?? ACCOUNT_COLORS[3]);
  const [notes, setNotes] = useState(debt?.notes ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "done">("idle");
  const [busy, setBusy] = useState(false);

  const cents = amount ? toCents(parseFloat(amount)) : 0;
  const paymentCents = payment ? toCents(parseFloat(payment)) : 0;
  const monthlyRate = rate ? parseFloat(rate) / 100 : 0;
  const balance = isEdit ? debt.currentBalance : cents;
  const estimate = estimatePayoff(balance, monthlyRate, paymentCents);
  const TypeIcon = DEBT_TYPE_META[type].icon;

  const canSubmit =
    name.trim().length > 0 && creditor.trim().length > 0 && (isEdit || cents > 0) && status === "idle";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus("saving");
    try {
      if (isEdit) {
        const clear: ("interestRate" | "monthlyPayment" | "dueDate" | "notes")[] = [];
        if (!rate && debt.interestRate !== undefined) clear.push("interestRate");
        if (!paymentCents && debt.monthlyPayment !== undefined) clear.push("monthlyPayment");
        if (!dueDate && debt.dueDate !== undefined) clear.push("dueDate");
        if (!notes.trim() && debt.notes) clear.push("notes");
        await updateDebt({
          debtId: debt._id,
          name: name.trim(),
          creditor: creditor.trim(),
          type,
          color,
          ...(rate ? { interestRate: monthlyRate } : {}),
          ...(paymentCents ? { monthlyPayment: paymentCents } : {}),
          ...(dueDate ? { dueDate: dateStrToTs(dueDate) } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          ...(clear.length ? { clear } : {}),
        });
      } else {
        await createDebt({
          name: name.trim(),
          creditor: creditor.trim(),
          type,
          originalAmount: cents,
          interestRate: rate ? monthlyRate : undefined,
          monthlyPayment: paymentCents || undefined,
          startDate: dateStrToTs(startDate),
          dueDate: dueDate ? dateStrToTs(dueDate) : undefined,
          currency,
          color,
          icon: "hand-coins",
          notes: notes.trim() || undefined,
        });
      }
      haptic(12);
      setStatus("done");
      toast.success(isEdit ? "Deuda actualizada" : `«${name.trim()}» registrada`);
      setTimeout(onDone, reduce ? 0 : 520);
    } catch (err) {
      setStatus("idle");
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    }
  }

  async function toggleArchive() {
    if (!debt) return;
    setBusy(true);
    try {
      await setArchived({ debtId: debt._id, archived: !debt.archived });
      toast.success(debt.archived ? "Deuda restaurada" : "Deuda archivada");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo archivar");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!debt) return;
    setBusy(true);
    try {
      await removeDebt({ debtId: debt._id });
      toast.success("Deuda eliminada");
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo eliminar");
      setBusy(false);
    }
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-6">
      {/* Vista previa */}
      <div
        className="relative overflow-hidden rounded-[24px] border border-white/40 px-4 pb-4 pt-5 text-center dark:border-white/10"
        style={{ background: `linear-gradient(160deg, ${tint(color, 16)}, transparent 70%)` }}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-10 left-1/2 h-28 w-40 -translate-x-1/2 rounded-full blur-3xl transition-[background-color] duration-500"
          style={{ backgroundColor: tint(color, 40) }}
        />
        <div className="relative flex items-center justify-center gap-2">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-[10px] transition-colors duration-300"
            style={{ background: tint(color, 20), color }}
            aria-hidden="true"
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={type}
                initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.4, rotate: -25 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.4 }}
                transition={reduce ? { duration: 0.12 } : { type: "spring", stiffness: 600, damping: 22 }}
                className="flex"
              >
                <TypeIcon className="h-4 w-4" />
              </motion.span>
            </AnimatePresence>
          </span>
          <span className={cn("max-w-[14rem] truncate text-sm font-semibold", name.trim() ? "text-foreground" : "text-muted-foreground/60")}>
            {name.trim() || "Nueva deuda"}
          </span>
        </div>

        {isEdit ? (
          <div className="relative mt-2">
            <p className="font-mono-num text-[34px] font-extrabold tracking-tight text-foreground">
              {formatCents(debt.currentBalance, debt.currency)}
            </p>
            <p className="text-xs text-muted-foreground">
              Saldo pendiente de {formatCents(debt.originalAmount, debt.currency)} · el monto no se edita
            </p>
          </div>
        ) : (
          <>
            <label htmlFor={`${formId}-amount`} className="sr-only">Monto que debes</label>
            <div className="relative mt-2 flex items-baseline justify-center gap-1.5">
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
            <p className="relative text-xs text-muted-foreground">Cuánto debes hoy</p>
          </>
        )}

        {/* Estimación de pago */}
        <AnimatePresence initial={false}>
          {estimate && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className={cn(
                "relative mx-auto mt-3 w-fit overflow-hidden rounded-full px-3 py-1 text-xs font-semibold",
                estimate.covers ? "bg-background/60 text-foreground" : "text-destructive",
              )}
              style={estimate.covers ? undefined : { background: tint("var(--os-magenta)", 14) }}
            >
              {estimate.covers
                ? <>Terminas en {estimate.months} {estimate.months === 1 ? "cuota" : "cuotas"} · {formatMonth(estimate.payoff)}{estimate.interest > 0 && <> · {formatCents(estimate.interest, isEdit ? debt.currency : currency)} en intereses</>}</>
                : "La cuota no alcanza a cubrir los intereses"}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <div className="space-y-2">
        <label htmlFor={`${formId}-name`} className={FIELD_LABEL}>Nombre</label>
        <Input
          id={`${formId}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Crédito libre inversión"
          maxLength={100}
          autoComplete="off"
          className="h-11 rounded-[14px] text-base"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor={`${formId}-creditor`} className={FIELD_LABEL}>A quién le debes</label>
        <Input
          id={`${formId}-creditor`}
          value={creditor}
          onChange={(e) => setCreditor(e.target.value)}
          placeholder="Banco, persona o entidad"
          maxLength={100}
          autoComplete="off"
          className="h-11 rounded-[14px] text-base"
        />
      </div>

      <div className="space-y-2">
        <span className={FIELD_LABEL}>Tipo</span>
        <div role="radiogroup" aria-label="Tipo de deuda" className={OVERFLOW_ROW}>
          {DEBT_TYPE_ORDER.map((t) => {
            const meta = DEBT_TYPE_META[t];
            const Icon = meta.icon;
            const selected = type === t;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => { haptic(); setType(t); }}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-[background-color,border-color,transform] active:scale-95",
                  selected ? "text-foreground" : "border-border bg-[var(--surface-2)] text-muted-foreground",
                )}
                style={selected ? { background: tint(color, 18), borderColor: tint(color, 55) } : undefined}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      {!isEdit && (
        <div className="space-y-2">
          <span className={FIELD_LABEL}>Moneda</span>
          <Segmented
            label="Moneda"
            value={currency}
            onChange={(c) => { haptic(); setCurrency(c); }}
            options={CURRENCIES.map((c) => ({ value: c.code, label: c.code }))}
            small
          />
        </div>
      )}

      {/* Condiciones del crédito */}
      <div className="space-y-2">
        <span className={FIELD_LABEL}>Condiciones (opcional)</span>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label htmlFor={`${formId}-rate`} className="px-1 text-xs font-semibold text-muted-foreground">Tasa mensual %</label>
            <DecimalInput
              id={`${formId}-rate`}
              value={rate}
              onChange={setRate}
              maxDecimals={4}
              min={0}
              max={100}
              placeholder="Ej: 1,8"
              className="h-11 rounded-[14px]"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${formId}-payment`} className="px-1 text-xs font-semibold text-muted-foreground">Cuota mensual</label>
            <MoneyInput
              id={`${formId}-payment`}
              value={payment}
              onChange={setPayment}
              placeholder="0"
              inputMode="decimal"
              className="h-11 rounded-[14px]"
            />
          </div>
        </div>
      </div>

      <div className={cn("grid gap-2", isEdit ? "grid-cols-1" : "grid-cols-2")}>
        {!isEdit && (
          <div className="space-y-1">
            <label htmlFor={`${formId}-start`} className={FIELD_LABEL}>Desde</label>
            <DatePicker id={`${formId}-start`} value={startDate} onChange={setStartDate} required className="h-11 rounded-[14px]" />
          </div>
        )}
        <div className="space-y-1">
          <label htmlFor={`${formId}-due`} className={FIELD_LABEL}>Fecha límite</label>
          <div className="relative">
            <DatePicker id={`${formId}-due`} value={dueDate} onChange={setDueDate} className="h-11 rounded-[14px]" />
            {dueDate && (
              <button
                type="button"
                onClick={() => setDueDate("")}
                aria-label="Quitar fecha límite"
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
        <ColorPicker value={color} onChange={setColor} original={debt?.color} />
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
            {debt.archived
              ? <><ArchiveRestore className="h-4 w-4" aria-hidden="true" /> Restaurar deuda</>
              : <><Archive className="h-4 w-4" aria-hidden="true" /> Archivar deuda</>}
          </button>
          {debt.archived ? (
            <>
              <div className="flex items-start gap-2 rounded-[14px] border border-destructive/20 bg-destructive/10 px-3 py-2.5">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                <p className="text-xs text-destructive">
                  Eliminarla borra también sus abonos y sus movimientos, y devuelve a tus cuentas lo que pagaste desde ellas. No se puede deshacer.
                </p>
              </div>
              <HoldToConfirmButton label="Mantén para eliminar" busyLabel="Eliminando…" busy={busy} onConfirm={handleDelete} />
            </>
          ) : (
            <p className="text-center text-xs text-muted-foreground">
              Archivada sale de la lista y de las alertas. Para eliminarla, primero archívala.
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
              {status === "idle" && (isEdit ? "Guardar cambios" : "Registrar deuda")}
            </motion.span>
          </AnimatePresence>
        </button>
      </AppSheetFooter>
    </form>
  );
}
