"use client";

import { useId, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Loader2, Percent } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AppSheet, AppSheetFooter } from "@/components/ui/app-sheet";
import { CategoryIcon } from "@/components/ui/category-icon";
import { DatePicker } from "@/components/ui/date-picker";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Switch } from "@/components/ui/switch";
import { FIELD_LABEL, OVERFLOW_ROW } from "@/lib/ios";
import {
  calculateInstallment,
  dateStrToTs,
  formatCents,
  fromCents,
  toCents,
  tsToDateStr,
} from "@/lib/money";
import { cn } from "@/lib/utils";
import { EASE_OUT_EXPO, SPRING, haptic, tint, type Purchase } from "./shared";
import { errorMessage } from "@/lib/errorMessage";

/** Números de cuotas que ofrecen los bancos; el resto se escribe a mano. */
const COMMON_INSTALLMENTS = [1, 3, 6, 12, 24, 36];

export function PurchaseSheet({
  cardId,
  cardName,
  currency,
  defaultInterestRate,
  purchase,
  open,
  onOpenChange,
}: {
  cardId: Id<"cards">;
  cardName: string;
  currency: string;
  defaultInterestRate?: number;
  /** null = crear */
  purchase: Purchase | null;
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
      title={purchase ? "Editar compra" : "Nueva compra"}
      description={cardName}
      footer
    >
      <PurchaseFields
        key={`${purchase?._id ?? "new"}-${session}`}
        cardId={cardId}
        currency={currency}
        defaultInterestRate={defaultInterestRate}
        purchase={purchase}
        onDone={() => onOpenChange(false)}
      />
    </AppSheet>
  );
}

function PurchaseFields({
  cardId,
  currency,
  defaultInterestRate,
  purchase,
  onDone,
}: {
  cardId: Id<"cards">;
  currency: string;
  defaultInterestRate?: number;
  purchase: Purchase | null;
  onDone: () => void;
}) {
  const formId = useId();
  const reduce = useReducedMotion();
  const isEdit = !!purchase;
  // Con cuotas ya pagadas, tocar el monto o el plazo desharía el cronograma
  const canEditFinancials = isEdit ? purchase.paidInstallments === 0 : true;

  const createPurchase = useMutation(api.cardPurchases.createPurchase);
  const updatePurchase = useMutation(api.cardPurchases.updatePurchase);
  const categories = useQuery(api.categories.list, { type: "gasto" });

  const [description, setDescription] = useState(purchase?.description ?? "");
  const [amount, setAmount] = useState(purchase ? String(fromCents(purchase.totalAmount)) : "");
  const [installments, setInstallments] = useState(String(purchase?.totalInstallments ?? 1));
  const [hasInterest, setHasInterest] = useState(purchase?.hasInterest ?? false);
  const [ratePct, setRatePct] = useState(() => {
    if (purchase?.interestRate) return (purchase.interestRate * 100).toFixed(2);
    if (defaultInterestRate) return (defaultInterestRate * 100).toFixed(2);
    return "";
  });
  const [categoryId, setCategoryId] = useState<string>(purchase?.categoryId ?? "");
  const [date, setDate] = useState(() => tsToDateStr(purchase?.purchaseDate ?? Date.now()));
  const [notes, setNotes] = useState(purchase?.notes ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "done">("idle");

  const cents = amount ? toCents(parseFloat(amount)) : 0;
  const count = parseInt(installments) || 1;
  const rate = hasInterest ? (parseFloat(ratePct) || 0) / 100 : 0;

  const preview = useMemo(() => {
    if (!canEditFinancials || cents <= 0 || count <= 0) return null;
    return calculateInstallment(cents, rate, count);
  }, [canEditFinancials, cents, rate, count]);

  const canSubmit =
    description.trim().length > 0 &&
    cents > 0 &&
    (!canEditFinancials || !hasInterest || rate > 0) &&
    status === "idle";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus("saving");
    const firstInstallmentDate = new Date(`${date}T12:00:00`).getTime();
    try {
      if (isEdit) {
        await updatePurchase({
          purchaseId: purchase._id,
          description: description.trim(),
          clearCategory: !categoryId,
          categoryId: categoryId ? (categoryId as Id<"categories">) : undefined,
          notes: notes.trim() || undefined,
          ...(canEditFinancials && {
            totalAmount: cents,
            totalInstallments: count,
            hasInterest,
            interestRate: hasInterest ? rate : undefined,
            purchaseDate: dateStrToTs(date),
            firstInstallmentDate,
          }),
        });
      } else {
        await createPurchase({
          cardId,
          categoryId: categoryId ? (categoryId as Id<"categories">) : undefined,
          description: description.trim(),
          totalAmount: cents,
          totalInstallments: count,
          hasInterest,
          interestRate: hasInterest ? rate : undefined,
          purchaseDate: dateStrToTs(date),
          firstInstallmentDate,
          notes: notes.trim() || undefined,
        });
      }
      haptic(15);
      setStatus("done");
      toast.success(isEdit ? "Compra actualizada" : "Compra registrada");
      setTimeout(onDone, reduce ? 0 : 480);
    } catch (err) {
      setStatus("idle");
      toast.error(errorMessage(err, "No se pudo guardar"));
    }
  }

  const chips = COMMON_INSTALLMENTS.includes(count)
    ? COMMON_INSTALLMENTS
    : [...COMMON_INSTALLMENTS, count].sort((a, b) => a - b);

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-6">
      {isEdit && !canEditFinancials && (
        <p className="rounded-[16px] px-4 py-3 text-sm" style={{ background: tint("var(--os-orange)", 12) }}>
          Esta compra ya tiene {purchase.paidInstallments}{" "}
          {purchase.paidInstallments === 1 ? "cuota pagada" : "cuotas pagadas"}: solo puedes cambiar la
          descripción, la categoría y las notas.
        </p>
      )}

      {/* Monto en grande, con la cuota mensual debajo */}
      <div
        className="relative overflow-hidden rounded-[24px] border border-white/40 px-4 pb-4 pt-5 text-center dark:border-white/10"
        style={{ background: `linear-gradient(160deg, ${tint("var(--os-cyan)", 12)}, transparent 70%)` }}
      >
        <label htmlFor={`${formId}-amount`} className="sr-only">Monto de la compra</label>
        <div className="flex items-baseline justify-center gap-1.5">
          <MoneyInput
            id={`${formId}-amount`}
            value={amount}
            onChange={setAmount}
            placeholder="0"
            inputMode="decimal"
            required
            disabled={!canEditFinancials}
            className="h-auto w-full max-w-[14rem] border-none bg-transparent p-0 text-center font-mono-num shadow-none focus-visible:ring-0 disabled:opacity-70"
            style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em" }}
          />
          <span className="rounded-full bg-background/60 px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
            {currency}
          </span>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={preview ? `${preview.amountPerInstallment}-${count}` : "empty"}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="mt-1.5 text-xs text-muted-foreground"
          >
            {preview
              ? <>
                  <strong className="font-mono-num text-foreground">
                    {formatCents(preview.amountPerInstallment, currency)}
                  </strong>
                  {count > 1 ? ` al mes durante ${count} meses` : " en una sola cuota"}
                </>
              : "Escribe cuánto costó"}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Descripción */}
      <div className="space-y-2">
        <label htmlFor={`${formId}-desc`} className={FIELD_LABEL}>¿Qué compraste?</label>
        <Input
          id={`${formId}-desc`}
          placeholder="iPhone 16, nevera, mercado…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          className="h-11 rounded-[14px]"
        />
      </div>

      {/* Cuotas */}
      <div className={cn("space-y-2", !canEditFinancials && "opacity-50")}>
        <span className={FIELD_LABEL}>Número de cuotas</span>
        <div role="radiogroup" aria-label="Número de cuotas" className={OVERFLOW_ROW}>
          {chips.map((n) => {
            const active = count === n;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={!canEditFinancials}
                onClick={() => { haptic(); setInstallments(String(n)); }}
                className={cn(
                  "relative shrink-0 rounded-[14px] border px-4 py-2 font-mono-num text-[13px] font-bold tabular-nums transition-[border-color,transform] active:scale-95 disabled:pointer-events-none",
                  active ? "border-transparent text-foreground" : "border-border bg-[var(--surface-2)] text-muted-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId={`${formId}-inst-pill`}
                    className="absolute inset-0 rounded-[14px] bg-[color-mix(in_oklch,var(--os-cyan)_14%,transparent)] ring-1 ring-inset ring-[color-mix(in_oklch,var(--os-cyan)_45%,transparent)]"
                    transition={SPRING}
                  />
                )}
                <span className="relative">{n}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor={`${formId}-inst`} className="px-1 text-xs text-muted-foreground">
            U otro número:
          </label>
          <Input
            id={`${formId}-inst`}
            type="number"
            inputMode="numeric"
            min="1"
            max="60"
            value={installments}
            onChange={(e) => setInstallments(e.target.value)}
            disabled={!canEditFinancials}
            className="h-10 w-20 rounded-[12px] font-mono-num"
          />
        </div>
      </div>

      {/* Interés */}
      <div className={cn("space-y-3 rounded-[18px] border border-border bg-[var(--surface-2)] px-4 py-3", !canEditFinancials && "opacity-50")}>
        <label className="flex cursor-pointer items-center gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ background: tint("var(--os-orange)", 16), color: "var(--os-orange-text)" }}
          >
            <Percent className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold text-foreground">¿Genera intereses?</span>
            <span className="block text-xs text-muted-foreground">
              Se calcula con interés compuesto sobre el saldo.
            </span>
          </span>
          <Switch
            checked={hasInterest}
            onCheckedChange={(v) => { haptic(); setHasInterest(v); }}
            disabled={!canEditFinancials}
          />
        </label>

        <AnimatePresence initial={false}>
          {hasInterest && (
            <motion.div
              initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
              className="overflow-hidden"
            >
              <div className="space-y-2 pt-1">
                <label htmlFor={`${formId}-rate`} className={FIELD_LABEL}>Tasa mensual (m.v.)</label>
                <DecimalInput
                  id={`${formId}-rate`}
                  maxDecimals={3}
                  min={0.001}
                  max={100}
                  placeholder="Ej: 2,5"
                  value={ratePct}
                  onChange={setRatePct}
                  required
                  disabled={!canEditFinancials}
                  className="h-11 rounded-[14px] font-mono-num"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Categoría */}
      <div className="space-y-2">
        <span className={FIELD_LABEL}>Categoría</span>
        <div role="radiogroup" aria-label="Categoría" className={OVERFLOW_ROW}>
          <button
            type="button"
            role="radio"
            aria-checked={categoryId === ""}
            onClick={() => { haptic(); setCategoryId(""); }}
            className={cn(
              "flex shrink-0 items-center rounded-[14px] border px-3 py-2 text-[13px] font-semibold transition-[background-color,border-color,transform] active:scale-95",
              categoryId === ""
                ? "border-foreground/30 bg-muted text-foreground"
                : "border-border bg-[var(--surface-2)] text-muted-foreground",
            )}
          >
            Sin categoría
          </button>
          {(categories ?? []).map((c) => {
            const active = categoryId === c._id;
            return (
              <button
                key={c._id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => { haptic(); setCategoryId(c._id); }}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-[14px] border px-3 py-2 text-[13px] font-semibold transition-[background-color,border-color,transform] active:scale-95",
                  active ? "text-foreground" : "border-border bg-[var(--surface-2)] text-muted-foreground",
                )}
                style={active ? { borderColor: tint(c.color, 55), background: tint(c.color, 14) } : undefined}
              >
                <CategoryIcon name={c.icon} className="h-4 w-4 shrink-0" style={{ color: c.color }} aria-hidden="true" />
                <span className="truncate">{c.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Fecha */}
      <div className="space-y-2">
        <label htmlFor={`${formId}-date`} className={FIELD_LABEL}>Fecha de la compra</label>
        {/* DatePicker no acepta `disabled`: con cuotas pagadas la fecha se muestra fija */}
        {canEditFinancials ? (
          <DatePicker
            id={`${formId}-date`}
            value={date}
            onChange={setDate}
            required
            className="h-11 rounded-[14px]"
          />
        ) : (
          <Input
            id={`${formId}-date`}
            type="date"
            value={date}
            disabled
            className="h-11 rounded-[14px] opacity-60"
          />
        )}
      </div>

      {/* Notas */}
      <div className="space-y-2">
        <label htmlFor={`${formId}-notes`} className={FIELD_LABEL}>Nota</label>
        <Input
          id={`${formId}-notes`}
          placeholder="Opcional"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="h-11 rounded-[14px]"
        />
      </div>

      {/* Cómo queda el cronograma */}
      {preview && (
        <div className="space-y-2">
          <span className={FIELD_LABEL}>Cómo queda</span>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Cuota" value={formatCents(preview.amountPerInstallment, currency)} />
            <Stat label="Total a pagar" value={formatCents(preview.totalWithInterest, currency)} />
            <Stat
              label="Interés"
              value={formatCents(preview.totalInterest, currency)}
              tone={preview.totalInterest > 0 ? "var(--os-orange-text)" : undefined}
            />
          </div>
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
              {status === "saving" && <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Guardando…</>}
              {status === "done" && <><Check className="h-5 w-5" strokeWidth={3} aria-hidden="true" /> Listo</>}
              {status === "idle" && (isEdit ? "Guardar cambios" : "Registrar compra")}
            </motion.span>
          </AnimatePresence>
        </button>
      </AppSheetFooter>
    </form>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-[16px] bg-[var(--surface-2)] px-3 py-2.5 text-center">
      <p className="truncate text-[10px] font-semibold text-muted-foreground">{label}</p>
      <p
        className="mt-0.5 truncate font-mono-num text-[13px] font-bold tabular-nums text-foreground"
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </p>
    </div>
  );
}
