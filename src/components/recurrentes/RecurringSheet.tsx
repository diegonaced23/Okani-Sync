"use client";

import { useId, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowDownLeft, Check, Loader2, Pause, Play, Repeat, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AppSheet, AppSheetFooter } from "@/components/ui/app-sheet";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { DatePicker } from "@/components/ui/date-picker";
import { CategoryIcon } from "@/components/ui/category-icon";
import { FIELD_LABEL, OVERFLOW_ROW, SPRING, haptic, tint } from "@/lib/ios";
import { Segmented } from "@/components/ui/segmented";
import { SourceChip } from "@/components/ui/source-chip";
import { toCents, todayStr } from "@/lib/money";
import {
  SELECTABLE_FREQUENCIES,
  dateKeyToTs,
  firstMonthlyDateKey,
  tsToDateKey,
  upcomingOccurrences,
  type SelectableFrequency,
} from "@/lib/recurrence";
import { cn } from "@/lib/utils";
import {
  FREQUENCY_LABELS,
  SUGGESTIONS,
  describeSchedule,
  formatLongDate,
  formatShortDate,
  kindOf,
  type Recurring,
  type RecurringKind,
} from "./shared";

const DAY_MS = 86_400_000;
const KIND_TONE: Record<RecurringKind, string> = { gasto: "var(--os-magenta)", ingreso: "var(--os-lime)" };

type Source = { kind: "account"; id: Id<"accounts"> } | { kind: "card"; id: Id<"cards"> };

interface RecurringSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = crear */
  recurring: Recurring | null;
  defaultKind: RecurringKind;
  onTogglePause: (rec: Recurring) => void;
  onDelete: (rec: Recurring) => void;
}

export function RecurringSheet({
  open,
  onOpenChange,
  recurring,
  defaultKind,
  onTogglePause,
  onDelete,
}: RecurringSheetProps) {
  // Cada apertura monta un formulario nuevo: el estado arranca limpio sin efectos
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
      title={recurring ? "Editar recurrente" : "Nuevo recurrente"}
      footer
    >
      <RecurringForm
        key={`${recurring?._id ?? "new"}-${session}`}
        recurring={recurring}
        defaultKind={defaultKind}
        onDone={() => onOpenChange(false)}
        onTogglePause={(r) => { onOpenChange(false); onTogglePause(r); }}
        onDelete={(r) => { onOpenChange(false); onDelete(r); }}
      />
    </AppSheet>
  );
}

function RecurringForm({
  recurring,
  defaultKind,
  onDone,
  onTogglePause,
  onDelete,
}: {
  recurring: Recurring | null;
  defaultKind: RecurringKind;
  onDone: () => void;
  onTogglePause: (rec: Recurring) => void;
  onDelete: (rec: Recurring) => void;
}) {
  const formId = useId();
  const reduce = useReducedMotion();
  const accounts = useQuery(api.accounts.list);
  const cards = useQuery(api.cards.list);
  const categories = useQuery(api.categories.list, {});
  const createRec = useMutation(api.recurringTransactions.create);
  const updateRec = useMutation(api.recurringTransactions.update);

  const isEdit = recurring !== null;
  const today = todayStr();
  const tomorrow = tsToDateKey(dateKeyToTs(today) + DAY_MS);

  const initialFrequency: SelectableFrequency =
    recurring && (SELECTABLE_FREQUENCIES as readonly string[]).includes(recurring.frequency)
      ? (recurring.frequency as SelectableFrequency)
      : "mensual";
  const initialDay = recurring?.dayOfMonth ?? new Date(dateKeyToTs(today)).getUTCDate();
  const initialDate = recurring ? tsToDateKey(recurring.nextOccurrence) : tomorrow;

  const [kind, setKind] = useState<RecurringKind>(recurring ? kindOf(recurring) : defaultKind);
  const [amount, setAmount] = useState(recurring ? String(recurring.amount / 100) : "");
  const [description, setDescription] = useState(recurring?.description ?? "");
  const [frequency, setFrequency] = useState<SelectableFrequency>(initialFrequency);
  const [dayOfMonth, setDayOfMonth] = useState(initialDay);
  const [dateKey, setDateKey] = useState(initialDate);
  const [source, setSource] = useState<Source | null>(() => {
    if (recurring?.accountId) return { kind: "account", id: recurring.accountId };
    if (recurring?.cardId) return { kind: "card", id: recurring.cardId };
    return null;
  });
  const [categoryId, setCategoryId] = useState<Id<"categories"> | null>(recurring?.categoryId ?? null);
  const [status, setStatus] = useState<"idle" | "saving" | "done">("idle");

  // Cuenta por defecto al crear, en cuanto llegan las cuentas
  const effectiveSource: Source | null =
    source ?? (!isEdit && accounts?.length
      ? { kind: "account", id: (accounts.find((a) => a.isDefault) ?? accounts[0])._id }
      : null);

  const account = effectiveSource?.kind === "account" ? accounts?.find((a) => a._id === effectiveSource.id) : undefined;
  const card = effectiveSource?.kind === "card" ? cards?.find((c) => c._id === effectiveSource.id) : undefined;
  const currency = account?.currency ?? card?.currency ?? recurring?.currency ?? "COP";

  // Las del sistema ("Pago de tarjeta", …) las asigna la app, no el usuario
  const kindCategories = (categories ?? []).filter(
    (c) => !c.isSystem && (c.type === kind || c.type === "ambos")
  );
  const category = kindCategories.find((c) => c._id === categoryId);
  const tone = category?.color ?? KIND_TONE[kind];

  // ── Programación ──────────────────────────────────────────────────────────
  const scheduleDirty =
    !isEdit ||
    frequency !== recurring.frequency ||
    (frequency === "mensual" ? dayOfMonth !== recurring.dayOfMonth : dateKey !== initialDate);
  const firstKey = frequency === "mensual" ? firstMonthlyDateKey(today, dayOfMonth) : dateKey;
  const dateError = scheduleDirty && frequency !== "mensual" && (!dateKey || dateKey < tomorrow)
    ? "Elige una fecha a partir de mañana"
    : null;
  const preview = useMemo(() => {
    if (dateError) return [];
    const first = scheduleDirty ? dateKeyToTs(firstKey) : recurring!.nextOccurrence;
    const anchor = frequency === "mensual" ? dayOfMonth : frequency === "anual" ? new Date(first).getUTCDate() : undefined;
    return upcomingOccurrences(frequency, first, 3, anchor);
  }, [dateError, scheduleDirty, firstKey, recurring, frequency, dayOfMonth]);

  const cents = amount ? toCents(parseFloat(amount)) : 0;
  const canSubmit =
    cents > 0 && description.trim().length > 0 && effectiveSource !== null && !dateError && status === "idle";

  function changeKind(next: RecurringKind) {
    if (next === kind) return;
    haptic();
    setKind(next);
    // Un ingreso no llega a una tarjeta de crédito, y la categoría debe ser del tipo
    if (next === "ingreso" && effectiveSource?.kind === "card") setSource(null);
    const cat = categories?.find((c) => c._id === categoryId);
    if (cat && cat.type !== next && cat.type !== "ambos") setCategoryId(null);
  }

  function applySuggestion(desc: string, hints: string[]) {
    haptic();
    setDescription(desc);
    const match = kindCategories.find((c) => hints.includes(c.name.trim().toLowerCase()));
    if (match) setCategoryId(match._id);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !effectiveSource) return;
    setStatus("saving");
    const sourceArgs = effectiveSource.kind === "account"
      ? { accountId: effectiveSource.id }
      : { cardId: effectiveSource.id };
    const scheduleArgs = {
      frequency,
      firstDate: firstKey,
      dayOfMonth: frequency === "mensual" ? dayOfMonth : undefined,
    };
    try {
      if (isEdit) {
        const sourceChanged =
          (effectiveSource.kind === "account" ? recurring.accountId : recurring.cardId) !== effectiveSource.id;
        await updateRec({
          recurringId: recurring._id,
          description: description.trim(),
          amount: cents,
          ...(sourceChanged ? sourceArgs : {}),
          ...(categoryId ? { categoryId } : { clearCategory: true }),
          ...(scheduleDirty ? scheduleArgs : {}),
        });
      } else {
        await createRec({
          type: kind,
          description: description.trim(),
          amount: cents,
          ...sourceArgs,
          ...(categoryId ? { categoryId } : {}),
          ...scheduleArgs,
        });
      }
      haptic(12);
      setStatus("done");
      toast.success(isEdit ? "Recurrente actualizado" : `«${description.trim()}» programado`);
      setTimeout(onDone, reduce ? 0 : 520);
    } catch (err) {
      setStatus("idle");
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    }
  }

  const suggestions = isEdit ? [] : SUGGESTIONS.filter((s) => s.kind === kind);

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-6">
      {/* Tipo: se elige al crear */}
      {!isEdit && (
        <Segmented
          label="Tipo de recurrente"
          value={kind}
          onChange={changeKind}
          options={[
            { value: "gasto", label: "Gasto" },
            { value: "ingreso", label: "Ingreso" },
          ]}
        />
      )}

      {/* Monto con vista previa en vivo */}
      <div className="relative overflow-hidden rounded-[24px] border border-white/40 px-4 pb-4 pt-5 text-center dark:border-white/10"
        style={{ background: `linear-gradient(160deg, ${tint(tone, 16)}, transparent 70%)` }}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-10 left-1/2 h-28 w-40 -translate-x-1/2 rounded-full blur-3xl transition-[background-color] duration-500"
          style={{ backgroundColor: tint(tone, 45) }}
        />
        <div className="relative flex items-center justify-center gap-2">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-[10px] transition-colors duration-300"
            style={{ background: tint(tone, 20), color: tone }}
            aria-hidden="true"
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={category?.icon ?? kind}
                initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.4, rotate: -25 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.4 }}
                transition={reduce ? { duration: 0.12 } : { type: "spring", stiffness: 600, damping: 22 }}
                className="flex"
              >
                {category
                  ? <CategoryIcon name={category.icon} className="h-4 w-4" />
                  : kind === "ingreso" ? <ArrowDownLeft className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
              </motion.span>
            </AnimatePresence>
          </span>
          <span className={cn("max-w-[14rem] truncate text-sm font-semibold", description.trim() ? "text-foreground" : "text-muted-foreground/60")}>
            {description.trim() || (kind === "ingreso" ? "Nuevo ingreso" : "Nuevo gasto")}
          </span>
        </div>

        <label htmlFor={`${formId}-amount`} className="sr-only">Monto</label>
        <div className="relative mt-2 flex items-baseline justify-center gap-1.5">
          <span className="text-2xl font-extrabold text-muted-foreground">{kind === "ingreso" ? "+" : "−"}</span>
          <MoneyInput
            id={`${formId}-amount`}
            value={amount}
            onChange={setAmount}
            placeholder="0"
            inputMode="decimal"
            className="h-auto w-full max-w-[14rem] border-none bg-transparent p-0 text-center font-mono-num shadow-none focus-visible:ring-0"
            style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-0.03em" }}
          />
          <span className="rounded-full bg-background/60 px-2 py-0.5 text-[11px] font-bold text-muted-foreground">{currency}</span>
        </div>

        <p className="relative mt-2 text-xs font-medium text-muted-foreground">
          {preview.length > 0
            ? <>{describeSchedule(frequency, preview[0], frequency === "mensual" ? dayOfMonth : undefined)} · {isEdit && !scheduleDirty ? "próximo" : "primero"} el <strong className="text-foreground">{formatLongDate(preview[0])}</strong></>
            : "Elige cuándo se repite"}
        </p>
      </div>

      {/* Descripción */}
      <div className="space-y-2">
        <label htmlFor={`${formId}-desc`} className={FIELD_LABEL}>Descripción</label>
        <Input
          id={`${formId}-desc`}
          placeholder={kind === "ingreso" ? "Ej: Salario" : "Ej: Netflix, Arriendo"}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={100}
          autoComplete="off"
          enterKeyHint="done"
          className="h-11 rounded-[14px] text-base"
        />
        {suggestions.length > 0 && (
          <div className={cn(OVERFLOW_ROW, "pt-1")}>
            {suggestions.map((s) => {
              const active = description.trim().toLowerCase() === s.description.toLowerCase();
              return (
                <button
                  key={s.description}
                  type="button"
                  aria-pressed={active}
                  onClick={() => applySuggestion(s.description, s.categoryHints)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-[background-color,border-color,transform] active:scale-95",
                    active ? "text-foreground" : "border-border bg-[var(--surface-2)] text-muted-foreground",
                  )}
                  style={active ? { background: tint(tone, 18), borderColor: tint(tone, 50) } : undefined}
                >
                  <CategoryIcon name={s.icon} className="h-3.5 w-3.5" aria-hidden="true" />
                  {s.description}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Frecuencia y fecha */}
      <div className="space-y-3">
        <span className={FIELD_LABEL}>Se repite</span>
        <Segmented
          label="Frecuencia"
          value={frequency}
          onChange={(f) => { haptic(); setFrequency(f); }}
          options={SELECTABLE_FREQUENCIES.map((f) => ({ value: f, label: FREQUENCY_LABELS[f] }))}
          small
        />

        <AnimatePresence mode="wait" initial={false}>
          {frequency === "mensual" ? (
            <motion.div
              key="month"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-2"
            >
              <DayOfMonthGrid value={dayOfMonth} onChange={setDayOfMonth} tone={tone} />
              {dayOfMonth > 28 && (
                <p className="px-1 text-xs text-muted-foreground">
                  En los meses que no tienen día {dayOfMonth} se registra el último día del mes.
                </p>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="date"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-1.5"
            >
              <label htmlFor={`${formId}-date`} className="block px-1 text-sm font-semibold text-foreground">
                {isEdit ? "Próximo cobro" : "Primer cobro"}
              </label>
              <DatePicker id={`${formId}-date`} value={dateKey} onChange={setDateKey} className="h-11 rounded-[14px]" />
              {dateError && <p role="alert" className="px-1 text-xs font-medium text-destructive">{dateError}</p>}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Próximas fechas */}
        {preview.length > 0 && (
          <div className="flex items-center gap-1.5 px-1" aria-label="Próximas fechas">
            {preview.map((ts, i) => (
              <motion.span
                key={`${ts}-${i}`}
                initial={reduce ? false : { opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-semibold",
                  i === 0 ? "text-foreground" : "bg-muted/70 text-muted-foreground",
                )}
                style={i === 0 ? { background: tint(tone, 18) } : undefined}
              >
                {formatShortDate(ts)}
              </motion.span>
            ))}
            <span className="text-xs text-muted-foreground">…</span>
          </div>
        )}
      </div>

      {/* Cuenta o tarjeta */}
      <div className="space-y-2">
        <span className={FIELD_LABEL}>{kind === "ingreso" ? "Llega a" : "Se paga con"}</span>
        <div role="radiogroup" aria-label="Cuenta o tarjeta" className={OVERFLOW_ROW}>
          {(accounts ?? []).map((a) => (
            <SourceChip
              key={a._id}
              selected={effectiveSource?.kind === "account" && effectiveSource.id === a._id}
              onSelect={() => { haptic(); setSource({ kind: "account", id: a._id }); }}
              color={a.color}
              name={a.name}
              detail={a.currency}
            />
          ))}
          {kind === "gasto" && (cards ?? []).map((c) => (
            <SourceChip
              key={c._id}
              selected={effectiveSource?.kind === "card" && effectiveSource.id === c._id}
              onSelect={() => { haptic(); setSource({ kind: "card", id: c._id }); }}
              color={c.color}
              name={c.name}
              detail={`····${c.lastFourDigits}`}
              isCard
            />
          ))}
          {accounts !== undefined && accounts.length === 0 && (
            <p className="px-1 text-sm text-muted-foreground">Primero crea una cuenta.</p>
          )}
        </div>
      </div>

      {/* Categoría */}
      {kindCategories.length > 0 && (
        <div className="space-y-2">
          <span className={FIELD_LABEL}>Categoría</span>
          <div role="radiogroup" aria-label="Categoría" className={OVERFLOW_ROW}>
            {kindCategories.map((c) => {
              const selected = categoryId === c._id;
              return (
                <button
                  key={c._id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => { haptic(); setCategoryId(selected ? null : c._id); }}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-[background-color,border-color,transform] active:scale-95",
                    selected ? "text-foreground" : "border-border bg-[var(--surface-2)] text-muted-foreground",
                  )}
                  style={selected ? { background: tint(c.color, 18), borderColor: tint(c.color, 55) } : undefined}
                >
                  <CategoryIcon name={c.icon} className="h-3.5 w-3.5" style={{ color: c.color }} aria-hidden="true" />
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isEdit && (
        <div className="grid grid-cols-2 gap-2 border-t border-border pt-5">
          <button
            type="button"
            onClick={() => onTogglePause(recurring)}
            className="flex items-center justify-center gap-2 rounded-[14px] bg-muted/70 py-3 text-sm font-semibold text-foreground transition-[background-color,transform] hover:bg-muted active:scale-[0.98]"
          >
            {recurring.paused
              ? <><Play className="h-4 w-4" aria-hidden="true" /> Reanudar</>
              : <><Pause className="h-4 w-4" aria-hidden="true" /> Pausar</>}
          </button>
          <button
            type="button"
            onClick={() => onDelete(recurring)}
            className="flex items-center justify-center gap-2 rounded-[14px] py-3 text-sm font-semibold text-destructive transition-[background-color,transform] hover:bg-destructive/10 active:scale-[0.98]"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" /> Eliminar
          </button>
          <p className="col-span-2 text-center text-xs text-muted-foreground">
            Los movimientos ya registrados no cambian.
          </p>
        </div>
      )}

      <AppSheetFooter>
        <button
          type="submit"
          form={formId}
          disabled={!canSubmit}
          className="relative flex h-12 w-full items-center justify-center overflow-hidden rounded-[16px] bg-gradient-to-r from-emerald-400 to-teal-500 text-[15px] font-bold text-white shadow-[0_10px_24px_-10px_rgb(16_185_129/0.8)] transition-[opacity,transform] active:scale-[0.98] disabled:opacity-40"
          // Guardando y guardado van deshabilitados, pero no atenuados
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
              {status === "idle" && (isEdit ? "Guardar cambios" : "Programar")}
            </motion.span>
          </AnimatePresence>
        </button>
      </AppSheetFooter>
    </form>
  );
}

// ─── Piezas ───────────────────────────────────────────────────────────────────

/** Cuadrícula tipo calendario con los días 1–31 */
function DayOfMonthGrid({ value, onChange, tone }: { value: number; onChange: (d: number) => void; tone: string }) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label="Día del mes" className="grid grid-cols-7 gap-1 rounded-[18px] bg-[var(--surface-2)] p-1.5">
      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => {
        const selected = value === d;
        return (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`Día ${d}`}
            onClick={() => { haptic(); onChange(d); }}
            className={cn(
              "relative flex aspect-square items-center justify-center rounded-full text-sm tabular-nums transition-[color,transform] active:scale-90",
              selected ? "font-bold text-white" : "font-medium text-foreground hover:bg-muted",
            )}
          >
            {selected && (
              <motion.span
                layoutId={`${id}-day`}
                className="absolute inset-0.5 rounded-full"
                style={{ background: tone, boxShadow: `0 6px 14px -6px ${tint(tone, 90)}` }}
                transition={SPRING}
              />
            )}
            <span className="relative">{d}</span>
          </button>
        );
      })}
    </div>
  );
}
