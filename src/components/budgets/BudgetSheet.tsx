"use client";

import { useId, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AppSheet, AppSheetFooter } from "@/components/ui/app-sheet";
import { CategoryIcon } from "@/components/ui/category-icon";
import { MoneyInput } from "@/components/ui/money-input";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_ALERT_THRESHOLD } from "@/lib/constants";
import { FIELD_LABEL, OVERFLOW_ROW, haptic, tint } from "@/lib/ios";
import { formatCents, formatMonth, fromCents, toCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { type Budget, ratioOf } from "./shared";
import { errorMessage } from "@/lib/errorMessage";

/** Atajos de umbral: los porcentajes que la gente elige de verdad. */
const THRESHOLDS = [60, 70, 80, 90, 95];

export function BudgetSheet({
  open,
  onOpenChange,
  budget,
  month,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = crear */
  budget: Budget | null;
  month: string;
}) {
  // Cada apertura reinicia el formulario, sin arrastrar lo escrito la vez anterior
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
      title={budget ? "Editar presupuesto" : "Nuevo presupuesto"}
      description={budget ? budget.categoryName : `Para ${formatMonth(month).toLowerCase()}`}
      footer
    >
      <BudgetFields
        key={`${budget?._id ?? "new"}-${session}`}
        budget={budget}
        month={month}
        onDone={() => onOpenChange(false)}
      />
    </AppSheet>
  );
}

function BudgetFields({
  budget,
  month,
  onDone,
}: {
  budget: Budget | null;
  month: string;
  onDone: () => void;
}) {
  const formId = useId();
  const reduce = useReducedMotion();
  const isEdit = !!budget;

  const create = useMutation(api.budgets.create);
  const update = useMutation(api.budgets.update);
  const categories = useQuery(api.categories.list, isEdit ? "skip" : { type: "gasto" });
  const existing = useQuery(api.budgets.listByMonth, isEdit ? "skip" : { month });
  const me = useQuery(api.users.getMe);

  const [categoryId, setCategoryId] = useState<Id<"categories"> | null>(budget?.categoryId ?? null);
  const [amount, setAmount] = useState(isEdit ? String(fromCents(budget.amount)) : "");
  const [threshold, setThreshold] = useState(budget?.alertThreshold ?? DEFAULT_ALERT_THRESHOLD);
  const [recurring, setRecurring] = useState(budget?.recurring ?? false);
  const [notes, setNotes] = useState(budget?.notes ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "done">("idle");

  const currency = budget?.currency ?? me?.currency ?? "COP";
  const cents = amount ? toCents(parseFloat(amount)) : 0;

  // Una categoría solo puede tener un presupuesto por mes: las que ya lo tienen se ocultan
  const taken = new Set((existing ?? []).map((b) => b.categoryId));
  const options = (categories ?? []).filter((c) => !taken.has(c._id));
  const selected = isEdit
    ? { name: budget.categoryName ?? "Sin categoría", color: budget.categoryColor ?? "var(--os-lime)", icon: budget.categoryIcon ?? "tag" }
    : (() => {
        const c = options.find((o) => o._id === categoryId);
        return c ? { name: c.name, color: c.color, icon: c.icon } : null;
      })();

  const tone = selected?.color ?? "var(--os-lime)";
  const canSubmit = cents > 0 && (isEdit || categoryId !== null) && status === "idle";
  // En edición el anillo ya tiene gasto real: se ve cómo queda el uso con el monto nuevo
  const previewRatio = isEdit && cents > 0 ? ratioOf({ amount: cents, spent: budget.spent }) : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus("saving");
    try {
      if (isEdit) {
        await update({
          budgetId: budget._id,
          amount: cents,
          alertThreshold: threshold,
          recurring,
          notes: notes.trim(),
        });
      } else {
        await create({
          categoryId: categoryId!,
          amount: cents,
          currency,
          month,
          alertThreshold: threshold,
          recurring,
          notes: notes.trim() || undefined,
        });
      }
      haptic(15);
      setStatus("done");
      toast.success(isEdit ? "Presupuesto actualizado" : "Presupuesto creado");
      setTimeout(onDone, reduce ? 0 : 480);
    } catch (err) {
      setStatus("idle");
      toast.error(errorMessage(err, "No se pudo guardar"));
    }
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-6">
      {/* Vista previa: el monto que se escribe, con el color de la categoría elegida */}
      <div
        className="relative overflow-hidden rounded-[24px] border border-white/40 px-4 pb-4 pt-5 text-center dark:border-white/10"
        style={{ background: `linear-gradient(160deg, ${tint(tone, 14)}, transparent 70%)` }}
      >
        <div className="relative mx-auto w-fit">
          <ProgressRing value={Math.min(previewRatio, 1)} color={tone} size={72} stroke={7}>
            <span
              className="flex h-12 w-12 items-center justify-center rounded-full"
              style={{ background: tint(tone, 18), color: tone }}
            >
              <CategoryIcon name={selected?.icon ?? "tag"} className="h-6 w-6" aria-hidden="true" />
            </span>
          </ProgressRing>
        </div>

        <label htmlFor={`${formId}-amount`} className="sr-only">Monto mensual</label>
        <div className="mt-3 flex items-baseline justify-center gap-1.5">
          <MoneyInput
            id={`${formId}-amount`}
            value={amount}
            onChange={setAmount}
            placeholder="0"
            inputMode="decimal"
            required
            className="h-auto w-full max-w-[13rem] border-none bg-transparent p-0 text-center font-mono-num shadow-none focus-visible:ring-0"
            style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em" }}
          />
          <span className="rounded-full bg-background/60 px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
            {currency}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {isEdit
            ? cents > 0
              ? <>Llevas gastado <strong className="text-foreground">{formatCents(budget.spent, currency)}</strong> · {Math.round(previewRatio * 100)}% del nuevo monto</>
              : `Llevas gastado ${formatCents(budget.spent, currency)}`
            : selected
              ? <>Límite mensual para <strong className="text-foreground">{selected.name}</strong></>
              : "Elige una categoría y su límite del mes"}
        </p>
      </div>

      {/* Categoría — solo al crear: cambiarla equivaldría a otro presupuesto */}
      {!isEdit && (
        <div className="space-y-2">
          <span className={FIELD_LABEL}>Categoría</span>
          {options.length === 0 ? (
            <p className="px-1 text-xs text-muted-foreground">
              {categories === undefined
                ? "Cargando categorías…"
                : "Todas tus categorías de gasto ya tienen presupuesto este mes."}
            </p>
          ) : (
            <div role="radiogroup" aria-label="Categoría" className={OVERFLOW_ROW}>
              {options.map((c) => {
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
          )}
        </div>
      )}

      {/* Umbral de alerta */}
      <div className="space-y-2">
        <span className={FIELD_LABEL}>Avisarme al llegar al</span>
        <div role="radiogroup" aria-label="Umbral de alerta" className={OVERFLOW_ROW}>
          {THRESHOLDS.map((t) => {
            const active = threshold === t;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => { haptic(); setThreshold(t); }}
                className={cn(
                  "shrink-0 rounded-[14px] border px-4 py-2 font-mono-num text-[13px] font-bold tabular-nums transition-[background-color,border-color,transform] active:scale-95",
                  active ? "text-foreground" : "border-border bg-[var(--surface-2)] text-muted-foreground",
                )}
                style={active ? { borderColor: tint(tone, 55), background: tint(tone, 14) } : undefined}
              >
                {t}%
              </button>
            );
          })}
        </div>
        <p className="px-1 text-xs text-muted-foreground">
          {cents > 0
            ? <>Recibirás la alerta al gastar <strong className="text-foreground">{formatCents(Math.round((cents * threshold) / 100), currency)}</strong>.</>
            : "Recibirás una notificación al superar ese porcentaje del presupuesto."}
        </p>
      </div>

      {/* Repetir cada mes */}
      <label className="flex cursor-pointer items-center gap-3 rounded-[18px] border border-border bg-[var(--surface-2)] px-4 py-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ background: tint("var(--os-cyan)", 16), color: "var(--os-cyan-text)" }}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-foreground">Repetir cada mes</span>
          <span className="block text-xs text-muted-foreground">
            El 1° se crea de nuevo con el mismo monto.
          </span>
        </span>
        <Switch checked={recurring} onCheckedChange={(v) => { haptic(); setRecurring(v); }} />
      </label>

      {/* Notas */}
      <div className="space-y-2">
        <label htmlFor={`${formId}-notes`} className={FIELD_LABEL}>Nota</label>
        <Textarea
          id={`${formId}-notes`}
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          placeholder="Opcional — en qué piensas gastarlo"
          className="rounded-[14px]"
        />
      </div>

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
              {status === "idle" && (isEdit ? "Guardar cambios" : "Crear presupuesto")}
            </motion.span>
          </AnimatePresence>
        </button>
      </AppSheetFooter>
    </form>
  );
}
