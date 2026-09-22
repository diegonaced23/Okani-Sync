"use client";

import { useId, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronRight, Circle, CircleCheck, Loader2, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AppSheet, AppSheetFooter } from "@/components/ui/app-sheet";
import { DatePicker } from "@/components/ui/date-picker";
import { MoneyInput } from "@/components/ui/money-input";
import { ProgressRing } from "@/components/ui/progress-ring";
import { SourceChip } from "@/components/ui/source-chip";
import { FIELD_LABEL, OVERFLOW_ROW } from "@/lib/ios";
import { formatCents, fromCents, simulateFIFOPayment, toCents, todayStr } from "@/lib/money";
import { cn } from "@/lib/utils";
import { EASE_OUT_EXPO, haptic, tint, usageOf, usageTone, type Card } from "./shared";
import { errorMessage } from "@/lib/errorMessage";

/**
 * Pagar la tarjeta. El anillo anticipa cómo queda el cupo con el monto escrito y
 * el desglose muestra qué cuotas quedan saldadas (FIFO), antes de confirmar.
 *
 * `minimumPayment` y `totalPayment` llegan por props desde la página: el detalle ya
 * los calculó y así la hoja no puede contradecirlo — antes se resuscribía a
 * `getPaymentSummary`, que define el pago mínimo sobre otro ciclo.
 *
 * Son opcionales porque la hoja también se abre desde el detalle de una compra, que
 * no tiene el ciclo de la tarjeta cargado: ahí no se ofrecen esos atajos en vez de
 * calcularlos por otro camino y arriesgarse a mostrar una cifra distinta.
 */
export function PayCardSheet({
  card,
  minimumPayment,
  totalPayment,
  open,
  onOpenChange,
}: {
  card: Card;
  minimumPayment?: number;
  totalPayment?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession((s) => s + 1);
  }

  return (
    <AppSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Pagar tarjeta"
      description={card.name}
      footer
    >
      <PayFields
        key={session}
        card={card}
        minimumPayment={minimumPayment}
        totalPayment={totalPayment}
        onDone={() => onOpenChange(false)}
      />
    </AppSheet>
  );
}

function PayFields({
  card,
  minimumPayment,
  totalPayment,
  onDone,
}: {
  card: Card;
  minimumPayment?: number;
  totalPayment?: number;
  onDone: () => void;
}) {
  const formId = useId();
  const reduce = useReducedMotion();
  const payCard = useMutation(api.cards.payCard);
  const accounts = useQuery(api.accounts.list);
  // Todas las cuotas de la tarjeta, incluidas las de compras ya liquidadas: el
  // cálculo FIFO necesita el total cargado histórico, no solo lo activo.
  const allInstallments = useQuery(api.cardInstallments.listAllByCard, { cardId: card._id });

  const [amount, setAmount] = useState(() => String(fromCents(card.currentBalance)));
  // todayStr() usa hora local; toISOString() daría fecha UTC que puede diferir un día
  const [date, setDate] = useState(todayStr);
  const [accountId, setAccountId] = useState<Id<"accounts"> | null>(null);
  const [showFifo, setShowFifo] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "settled">("idle");

  const cents = amount ? toCents(parseFloat(amount)) : 0;
  const overBalance = cents > card.currentBalance;
  const applied = Math.min(cents, card.currentBalance);
  const settles = applied > 0 && applied >= card.currentBalance;

  // Solo cuentas en la misma moneda: el pago no convierte
  const sameCurrency = useMemo(
    () => (accounts ?? []).filter((a) => a.currency === card.currency),
    [accounts, card.currency]
  );

  const usage = usageOf(card);
  const afterUsage = card.creditLimit > 0
    ? Math.max(0, (card.currentBalance - applied) / card.creditLimit)
    : 0;
  const tone = settles || status === "settled" ? "var(--os-lime)" : usageTone(usage);

  const fifo = useMemo(() => {
    if (!allInstallments || applied <= 0) return null;
    return simulateFIFOPayment(allInstallments, card.currentBalance, applied);
  }, [allInstallments, card.currentBalance, applied]);

  const quick = [
    ...(minimumPayment !== undefined && minimumPayment > 0
      ? [{ label: "Mínimo", value: minimumPayment }]
      : []),
    ...(totalPayment !== undefined && totalPayment > 0 && totalPayment !== minimumPayment
      ? [{ label: "Pago total", value: totalPayment }]
      : []),
    ...(card.currentBalance > 0 ? [{ label: "Todo el saldo", value: card.currentBalance }] : []),
  ];

  const canSubmit =
    cents > 0 && accountId !== null && date.length > 0 && status === "idle";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus("saving");
    try {
      await payCard({
        cardId: card._id,
        fromAccountId: accountId!,
        amount: cents,
        paymentDate: new Date(`${date}T12:00:00`).getTime(),
      });
      haptic(settles ? 40 : 12);
      setStatus(settles ? "settled" : "done");
      toast.success(
        settles
          ? `¡«${card.name}» quedó en cero!`
          : `Pago de ${formatCents(applied, card.currency)} registrado`
      );
      setTimeout(onDone, reduce ? 0 : settles ? 1400 : 520);
    } catch (err) {
      setStatus("idle");
      toast.error(errorMessage(err, "No se pudo registrar el pago"));
    }
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-6">
      {/* Anillo con el cupo que queda tras el pago, y el monto */}
      <div
        className="relative overflow-hidden rounded-[24px] border border-white/40 px-4 pb-4 pt-5 text-center dark:border-white/10"
        style={{ background: `linear-gradient(160deg, ${tint(tone, 14)}, transparent 70%)` }}
      >
        <div className="relative mx-auto w-fit">
          <ProgressRing
            value={status === "settled" ? 0 : Math.min(afterUsage, 1)}
            color={tone}
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
                  className="flex flex-col items-center"
                  style={{ color: "var(--os-lime-text)" }}
                >
                  <PartyPopper className="h-8 w-8" aria-hidden="true" />
                </motion.span>
              ) : (
                <motion.span key="pct" className="flex flex-col items-center leading-none">
                  <span className="font-mono-num text-2xl font-extrabold tabular-nums text-foreground">
                    {Math.round(afterUsage * 100)}%
                  </span>
                  <span className="mt-1 text-[10px] font-semibold text-muted-foreground">
                    del cupo
                  </span>
                </motion.span>
              )}
            </AnimatePresence>
          </ProgressRing>
        </div>

        <label htmlFor={`${formId}-amount`} className="sr-only">Monto a pagar</label>
        <div className="mt-3 flex items-baseline justify-center gap-1.5">
          <MoneyInput
            id={`${formId}-amount`}
            value={amount}
            onChange={setAmount}
            placeholder="0"
            inputMode="decimal"
            className="h-auto w-full max-w-[14rem] border-none bg-transparent p-0 text-center font-mono-num shadow-none focus-visible:ring-0"
            style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em" }}
          />
          <span className="rounded-full bg-background/60 px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
            {card.currency}
          </span>
        </div>

        <p
          className={cn("mt-1 text-xs font-medium", overBalance ? "text-[var(--os-orange-text)]" : "text-muted-foreground")}
          role={overBalance ? "status" : undefined}
        >
          {overBalance
            ? `Supera el saldo: se aplicará ${formatCents(card.currentBalance, card.currency)}`
            : settles
              ? "Con este pago la tarjeta queda en cero 🎉"
              : `Saldo pendiente: ${formatCents(card.currentBalance, card.currency)}`}
        </p>

        {quick.length > 0 && (
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
                    "flex flex-col items-center rounded-full px-3 py-1.5 text-xs font-semibold transition-[background-color,transform] active:scale-95",
                    active ? "text-foreground" : "bg-background/60 text-muted-foreground hover:text-foreground",
                  )}
                  style={active ? { background: tint(tone, 22) } : undefined}
                >
                  <span>{q.label}</span>
                  <span className="font-mono-num text-[10px] tabular-nums opacity-80">
                    {formatCents(q.value, card.currency)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Cuenta de origen */}
      <div className="space-y-2">
        <span className={FIELD_LABEL}>Sale de</span>
        {sameCurrency.length === 0 ? (
          <p className="rounded-[14px] border border-border px-3 py-2.5 text-sm text-muted-foreground">
            No tienes cuentas en {card.currency}. Crea una en esa moneda para poder pagar.
          </p>
        ) : (
          <div role="radiogroup" aria-label="Cuenta de origen" className={OVERFLOW_ROW}>
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
        )}
      </div>

      {/* Fecha */}
      <div className="space-y-2">
        <label htmlFor={`${formId}-date`} className={FIELD_LABEL}>Fecha del pago</label>
        <DatePicker id={`${formId}-date`} value={date} onChange={setDate} required className="h-11 rounded-[14px]" />
      </div>

      {/* Desglose FIFO: qué cuotas quedan saldadas con este monto */}
      {fifo && (fifo.newlyPaid.length > 0 || fifo.stillUnpaid.length > 0) && (
        <div className="overflow-hidden rounded-[18px] border border-border">
          <button
            type="button"
            onClick={() => setShowFifo((v) => !v)}
            aria-expanded={showFifo}
            className="flex w-full items-center justify-between gap-2 bg-[var(--surface-2)] px-4 py-3 text-left"
          >
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              Cómo se reparte
            </span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <strong className="text-foreground">
                {fifo.newlyPaid.length} {fifo.newlyPaid.length === 1 ? "cuota" : "cuotas"} saldada
                {fifo.newlyPaid.length === 1 ? "" : "s"}
              </strong>
              <motion.span animate={{ rotate: showFifo ? 90 : 0 }} transition={{ duration: 0.2 }} className="flex">
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </motion.span>
            </span>
          </button>

          <AnimatePresence initial={false}>
            {showFifo && (
              <motion.div
                initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
                exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
                className="overflow-hidden"
              >
                <ul className="divide-y divide-border/60">
                  {fifo.newlyPaid.map((inst) => (
                    <FifoItem key={inst._id} inst={inst} currency={card.currency} paid />
                  ))}
                  {fifo.stillUnpaid.map((inst) => (
                    <FifoItem key={inst._id} inst={inst} currency={card.currency} />
                  ))}
                </ul>
                <div className="flex items-center justify-between border-t border-border/60 bg-[var(--surface-2)] px-4 py-2.5">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    Queda debiendo
                  </span>
                  <span className="font-mono-num text-sm font-extrabold tabular-nums text-foreground">
                    {formatCents(fifo.newBalance, card.currency)}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <AppSheetFooter>
        <button
          type="submit"
          form={formId}
          disabled={!canSubmit}
          className="relative flex h-12 w-full items-center justify-center overflow-hidden rounded-[16px] bg-gradient-to-r from-emerald-400 to-teal-500 text-[15px] font-bold text-white shadow-[0_10px_24px_-10px_rgb(16_185_129/0.8)] transition-[opacity,transform] active:scale-[0.98] disabled:opacity-40"
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
              {(status === "done" || status === "settled") && (
                <><Check className="h-5 w-5" strokeWidth={3} aria-hidden="true" /> {status === "settled" ? "¡En cero!" : "Listo"}</>
              )}
              {status === "idle" && (applied > 0 ? `Pagar ${formatCents(applied, card.currency)}` : "Confirmar pago")}
            </motion.span>
          </AnimatePresence>
        </button>
      </AppSheetFooter>
    </form>
  );
}

function FifoItem({
  inst,
  currency,
  paid,
}: {
  inst: { description: string; dueDate: number; amount: number };
  currency: string;
  paid?: boolean;
}) {
  return (
    <li className={cn("flex items-center gap-3 px-4 py-2.5", !paid && "opacity-55")}>
      {paid ? (
        <CircleCheck className="h-4 w-4 shrink-0" style={{ color: "var(--os-lime-text)" }} aria-hidden="true" />
      ) : (
        <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{inst.description}</span>
        <span className="block text-[11px] text-muted-foreground">
          {new Date(inst.dueDate).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}
        </span>
      </span>
      <span
        className="shrink-0 font-mono-num text-sm font-bold tabular-nums"
        style={paid ? { color: "var(--os-lime-text)" } : undefined}
      >
        {formatCents(inst.amount, currency)}
      </span>
    </li>
  );
}
