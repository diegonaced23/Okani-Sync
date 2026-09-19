"use client";

import { useId, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Loader2, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AppSheet, AppSheetFooter } from "@/components/ui/app-sheet";
import { MoneyInput } from "@/components/ui/money-input";
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { ProgressRing } from "@/components/ui/progress-ring";
import { SourceChip } from "@/components/ui/source-chip";
import { FIELD_LABEL, OVERFLOW_ROW, haptic, tint } from "@/lib/ios";
import { dateStrToTs, formatCents, fromCents, toCents, todayStr } from "@/lib/money";
import { cn } from "@/lib/utils";
import { progressOf, type Obligation } from "./shared";

/**
 * Registrar un abono: pagar una deuda o recibir un cobro de un préstamo. El anillo
 * anticipa cómo queda el progreso con el monto escrito, y si el abono salda el total
 * se celebra antes de cerrar.
 */
export function PaymentSheet({
  obligation,
  open,
  onOpenChange,
}: {
  obligation: Obligation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession((s) => s + 1);
  }
  const isDebt = obligation?.kind === "debt";

  return (
    <AppSheet
      open={open && obligation !== null}
      onOpenChange={onOpenChange}
      title={isDebt ? "Registrar abono" : "Registrar cobro"}
      description={obligation ? `${obligation.name} · ${obligation.counterpart}` : undefined}
      footer
    >
      {obligation && (
        <PaymentForm key={`${obligation.id}-${session}`} o={obligation} onDone={() => onOpenChange(false)} />
      )}
    </AppSheet>
  );
}

function PaymentForm({ o, onDone }: { o: Obligation; onDone: () => void }) {
  const formId = useId();
  const reduce = useReducedMotion();
  const accounts = useQuery(api.accounts.list);
  const addPayment = useMutation(api.debts.addPayment);
  const addRepayment = useMutation(api.loans.addRepayment);
  const isDebt = o.kind === "debt";

  const suggested = isDebt && o.monthlyPayment ? Math.min(o.monthlyPayment, o.currentBalance) : undefined;
  const [amount, setAmount] = useState(suggested ? String(fromCents(suggested)) : "");
  const [date, setDate] = useState(todayStr);
  const [accountId, setAccountId] = useState<Id<"accounts"> | null>(null);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "settled">("idle");

  const cents = amount ? toCents(parseFloat(amount)) : 0;
  const tooMuch = cents > o.currentBalance;
  const settles = cents > 0 && cents === o.currentBalance;
  const current = progressOf(o);
  const after = progressOf({ originalAmount: o.originalAmount, currentBalance: Math.max(0, o.currentBalance - cents) });
  const tone = o.status === "vencida" ? "var(--os-magenta)" : o.color;
  // Solo cuentas en la misma moneda: el abono no convierte
  const sameCurrency = (accounts ?? []).filter((a) => a.currency === o.currency);
  const canSubmit = cents > 0 && !tooMuch && date.length > 0 && status === "idle";

  const quick = [
    ...(suggested ? [{ label: "Cuota", value: suggested }] : []),
    ...(o.currentBalance > 1 ? [{ label: "Mitad", value: Math.round(o.currentBalance / 2) }] : []),
    { label: "Todo el saldo", value: o.currentBalance },
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus("saving");
    try {
      const common = {
        amount: cents,
        date: dateStrToTs(date),
        notes: notes.trim() || undefined,
      };
      if (isDebt) {
        await addPayment({ debtId: o.id as Id<"debts">, fromAccountId: accountId ?? undefined, ...common });
      } else {
        await addRepayment({ loanId: o.id as Id<"loans">, toAccountId: accountId ?? undefined, ...common });
      }
      haptic(settles ? 40 : 12);
      setStatus(settles ? "settled" : "done");
      toast.success(settles
        ? isDebt ? `¡«${o.name}» quedó saldada!` : `¡${o.counterpart} te pagó todo!`
        : isDebt ? "Abono registrado" : "Cobro registrado");
      setTimeout(onDone, reduce ? 0 : settles ? 1400 : 520);
    } catch (err) {
      setStatus("idle");
      toast.error(err instanceof Error ? err.message : "No se pudo registrar");
    }
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-6">
      {/* Anillo con la vista previa del progreso y el monto */}
      <div
        className="relative overflow-hidden rounded-[24px] border border-white/40 px-4 pb-4 pt-5 text-center dark:border-white/10"
        style={{ background: `linear-gradient(160deg, ${tint(tone, 14)}, transparent 70%)` }}
      >
        <div className="relative mx-auto w-fit">
          <ProgressRing
            value={status === "settled" ? 1 : current}
            preview={after}
            color={status === "settled" ? "var(--os-lime)" : tone}
            size={112}
            stroke={9}
          >
            <AnimatePresence mode="wait" initial={false}>
              {status === "settled" ? (
                <motion.span
                  key="settled"
                  initial={reduce ? { opacity: 0 } : { scale: 0.3, opacity: 0, rotate: -20 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 16 }}
                  className="flex flex-col items-center text-lime-text"
                >
                  <PartyPopper className="h-8 w-8" aria-hidden="true" />
                </motion.span>
              ) : (
                <motion.span key="pct" className="flex flex-col items-center leading-none">
                  <span className="font-mono-num text-2xl font-extrabold tabular-nums text-foreground">
                    {Math.round(after * 100)}%
                  </span>
                  <span className="mt-1 text-[10px] font-semibold text-muted-foreground">
                    {isDebt ? "pagado" : "cobrado"}
                  </span>
                </motion.span>
              )}
            </AnimatePresence>
          </ProgressRing>
        </div>

        <label htmlFor={`${formId}-amount`} className="sr-only">Monto</label>
        <div className="mt-3 flex items-baseline justify-center gap-1.5">
          <MoneyInput
            id={`${formId}-amount`}
            value={amount}
            onChange={setAmount}
            placeholder="0"
            inputMode="decimal"
            aria-invalid={tooMuch || undefined}
            className="h-auto w-full max-w-[14rem] border-none bg-transparent p-0 text-center font-mono-num shadow-none focus-visible:ring-0"
            style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em" }}
          />
          <span className="rounded-full bg-background/60 px-2 py-0.5 text-[11px] font-bold text-muted-foreground">{o.currency}</span>
        </div>
        <p className={cn("mt-1 text-xs font-medium", tooMuch ? "text-destructive" : "text-muted-foreground")} role={tooMuch ? "alert" : undefined}>
          {tooMuch
            ? `Supera el saldo de ${formatCents(o.currentBalance, o.currency)}`
            : settles
              ? isDebt ? "Con este abono la deuda queda saldada 🎉" : "Con este cobro queda todo pagado 🎉"
              : `Saldo pendiente: ${formatCents(o.currentBalance, o.currency)}`}
        </p>

        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {quick.map((q) => {
            const active = cents === q.value;
            return (
              <button
                key={q.label}
                type="button"
                onClick={() => { haptic(); setAmount(String(fromCents(q.value))); }}
                aria-pressed={active}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-semibold transition-[background-color,transform] active:scale-95",
                  active ? "text-foreground" : "bg-background/60 text-muted-foreground hover:text-foreground",
                )}
                style={active ? { background: tint(tone, 22) } : undefined}
              >
                {q.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor={`${formId}-date`} className={FIELD_LABEL}>Fecha</label>
        <DatePicker id={`${formId}-date`} value={date} onChange={setDate} required className="h-11 rounded-[14px]" />
      </div>

      <div className="space-y-2">
        <span className={FIELD_LABEL}>{isDebt ? "Sale de" : "Entra a"}</span>
        <div role="radiogroup" aria-label="Cuenta" className={OVERFLOW_ROW}>
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
          {accountId
            ? isDebt ? "Se descuenta del saldo de la cuenta." : "Se suma al saldo de la cuenta."
            : "Solo se registra el abono, sin mover el saldo de ninguna cuenta."}
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor={`${formId}-notes`} className={FIELD_LABEL}>Nota</label>
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
              {status === "saving" && <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Registrando…</>}
              {(status === "done" || status === "settled") && <><Check className="h-5 w-5" strokeWidth={3} aria-hidden="true" /> {status === "settled" ? (isDebt ? "¡Saldada!" : "¡Cobrado!") : "Listo"}</>}
              {status === "idle" && (cents > 0 ? `${isDebt ? "Abonar" : "Registrar"} ${formatCents(cents, o.currency)}` : isDebt ? "Registrar abono" : "Registrar cobro")}
            </motion.span>
          </AnimatePresence>
        </button>
      </AppSheetFooter>
    </form>
  );
}
