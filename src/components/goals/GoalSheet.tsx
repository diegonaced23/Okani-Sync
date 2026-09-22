"use client";

import { useId, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AppSheet, AppSheetFooter } from "@/components/ui/app-sheet";
import { ColorPicker } from "@/components/ui/color-picker";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Segmented } from "@/components/ui/segmented";
import { SourceChip } from "@/components/ui/source-chip";
import { Textarea } from "@/components/ui/textarea";
import { ACCOUNT_COLORS, CURRENCIES } from "@/lib/constants";
import { FIELD_LABEL, OVERFLOW_ROW, SPRING, haptic, tint } from "@/lib/ios";
import { dateStrToTs, formatCents, fromCents, toCents, tsToDateStr } from "@/lib/money";
import { cn } from "@/lib/utils";
import { GOAL_ICONS, monthlyNeeded, type Goal } from "./shared";
import { errorMessage } from "@/lib/errorMessage";

export function GoalSheet({
  open,
  onOpenChange,
  goal,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = crear */
  goal: Goal | null;
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
      title={goal ? "Editar meta" : "Nueva meta"}
      description={goal ? undefined : "Ponle nombre y monto a lo que quieres lograr"}
      footer
    >
      <GoalFields key={`${goal?._id ?? "new"}-${session}`} goal={goal} onDone={() => onOpenChange(false)} />
    </AppSheet>
  );
}

function GoalFields({ goal, onDone }: { goal: Goal | null; onDone: () => void }) {
  const formId = useId();
  const reduce = useReducedMotion();
  const isEdit = !!goal;

  const create = useMutation(api.goals.create);
  const update = useMutation(api.goals.update);
  const accounts = useQuery(api.accounts.list);
  const me = useQuery(api.users.getMe);

  const [name, setName] = useState(goal?.name ?? "");
  const [description, setDescription] = useState(goal?.description ?? "");
  const [target, setTarget] = useState(isEdit ? String(fromCents(goal.targetAmount)) : "");
  // null = aún nadie la eligió: se resuelve con la preferencia del usuario cuando
  // `getMe` llega, que en el primer render todavía es undefined.
  const [currencyChoice, setCurrencyChoice] = useState<string | null>(null);
  const currency = currencyChoice ?? goal?.currency ?? me?.currency ?? "COP";
  const [icon, setIcon] = useState(goal?.icon ?? GOAL_ICONS[0]);
  const [color, setColor] = useState(goal?.color ?? ACCOUNT_COLORS[0]);
  const [deadline, setDeadline] = useState(goal?.deadline ? tsToDateStr(goal.deadline) : "");
  const [notes, setNotes] = useState(goal?.notes ?? "");
  const [linkedAccountId, setLinkedAccountId] = useState<Id<"accounts"> | null>(goal?.linkedAccountId ?? null);
  const [status, setStatus] = useState<"idle" | "saving" | "done">("idle");
  // Se fija al abrir la hoja: Date.now() en el render rompería la pureza
  const [nowMs] = useState(() => Date.now());

  const cents = target ? toCents(parseFloat(target)) : 0;
  const savingsAccounts = (accounts ?? []).filter((a) => a.type === "ahorros");
  const monthly = cents > 0 && deadline ? monthlyNeeded(cents, dateStrToTs(deadline), nowMs) : null;
  const canSubmit = name.trim().length > 0 && cents > 0 && status === "idle";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus("saving");
    try {
      const common = {
        name: name.trim(),
        description: description.trim() || undefined,
        targetAmount: cents,
        deadline: deadline ? dateStrToTs(deadline) : undefined,
        icon,
        color,
        notes: notes.trim() || undefined,
      };
      if (isEdit) {
        // null en vez de undefined: así el backend distingue «desvincular» de «no tocar»
        await update({ goalId: goal._id, currency, linkedAccountId, ...common });
      } else {
        await create({ currency, linkedAccountId: linkedAccountId ?? undefined, ...common });
      }
      haptic(15);
      setStatus("done");
      toast.success(isEdit ? "Meta actualizada" : "Meta creada");
      setTimeout(onDone, reduce ? 0 : 480);
    } catch (err) {
      setStatus("idle");
      toast.error(errorMessage(err, "No se pudo guardar"));
    }
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-6">
      {/* Vista previa en vivo: el emoji, el color y el nombre mientras se escriben */}
      <div className="relative flex flex-col items-center gap-3 pb-1 pt-2" aria-hidden="true">
        <span
          className="pointer-events-none absolute top-0 h-28 w-28 rounded-full blur-2xl transition-[background-color] duration-500"
          style={{ backgroundColor: tint(color, 55) }}
        />
        <span
          className="relative flex h-[76px] w-[76px] items-center justify-center rounded-[26px] border border-white/40 text-[34px] backdrop-blur-xl transition-[background-color,box-shadow] duration-300 dark:border-white/15"
          style={{
            backgroundColor: tint(color, 20),
            boxShadow: `0 12px 32px -10px ${tint(color, 70)}, inset 0 1px 0 rgba(255,255,255,0.35)`,
          }}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={icon}
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.4, rotate: -25 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.4, rotate: 25 }}
              transition={reduce ? { duration: 0.12 } : { type: "spring", stiffness: 600, damping: 22 }}
              className="flex"
            >
              {icon}
            </motion.span>
          </AnimatePresence>
        </span>
        <div className="relative flex flex-col items-center gap-1 text-center">
          <p className={cn(
            "max-w-[16rem] truncate text-lg font-extrabold tracking-tight",
            name.trim() ? "text-foreground" : "text-muted-foreground/60",
          )}>
            {name.trim() || "Nueva meta"}
          </p>
          {cents > 0 && (
            <span
              className="rounded-full px-2 py-0.5 font-mono-num text-[11px] font-bold tabular-nums"
              style={{ background: tint(color, 16), color }}
            >
              {formatCents(cents, currency)}
            </span>
          )}
        </div>
      </div>

      {/* Nombre */}
      <div className="space-y-2">
        <label htmlFor={`${formId}-name`} className={FIELD_LABEL}>¿Qué quieres lograr?</label>
        <Input
          id={`${formId}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Laptop nueva, fondo de emergencia, viaje…"
          maxLength={80}
          required
          className="h-11 rounded-[14px]"
        />
      </div>

      {/* Emoji */}
      <div className="space-y-2">
        <span className={FIELD_LABEL}>Ícono</span>
        <div role="radiogroup" aria-label="Ícono" className="grid grid-cols-9 gap-1.5">
          {GOAL_ICONS.map((emoji) => {
            const selected = icon === emoji;
            return (
              <button
                key={emoji}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`Ícono ${emoji}`}
                onClick={() => { haptic(); setIcon(emoji); }}
                className="relative flex aspect-square items-center justify-center rounded-[13px] text-lg transition-transform active:scale-90"
              >
                {selected && (
                  <motion.span
                    layoutId={`${formId}-icon`}
                    className="absolute inset-0 rounded-[13px]"
                    style={{ background: tint(color, 18), boxShadow: `inset 0 0 0 1.5px ${tint(color, 55)}` }}
                    transition={SPRING}
                  />
                )}
                <span className="relative">{emoji}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Color */}
      <div className="space-y-2">
        <span className={FIELD_LABEL}>Color</span>
        <ColorPicker value={color} onChange={setColor} original={goal?.color} />
      </div>

      {/* Monto objetivo */}
      <div className="space-y-2">
        <label htmlFor={`${formId}-target`} className={FIELD_LABEL}>Monto objetivo</label>
        <MoneyInput
          id={`${formId}-target`}
          value={target}
          onChange={setTarget}
          placeholder="0"
          inputMode="decimal"
          required
          className="h-11 rounded-[14px] font-mono-num text-base"
        />
      </div>

      {/* Moneda */}
      <div className="space-y-2">
        <span className={FIELD_LABEL}>Moneda</span>
        <Segmented
          label="Moneda"
          value={currency}
          onChange={(c) => { haptic(); setCurrencyChoice(c); }}
          options={CURRENCIES.map((c) => ({ value: c.code, label: c.code }))}
          small
        />
      </div>

      {/* Fecha límite */}
      <div className="space-y-2">
        <label htmlFor={`${formId}-deadline`} className={FIELD_LABEL}>Fecha límite</label>
        <DatePicker id={`${formId}-deadline`} value={deadline} onChange={setDeadline} className="h-11 rounded-[14px]" />
        <p className="px-1 text-xs text-muted-foreground">
          {monthly !== null
            ? <>Tendrías que ahorrar <strong className="text-foreground">{formatCents(monthly, currency)}</strong> al mes para llegar a tiempo.</>
            : "Opcional. Con una fecha te decimos cuánto ahorrar cada mes."}
        </p>
      </div>

      {/* Cuenta de ahorro vinculada */}
      {savingsAccounts.length > 0 && (
        <div className="space-y-2">
          <span className={cn(FIELD_LABEL, "flex items-center gap-1.5")}>
            <Link2 className="h-3 w-3" style={{ color: "var(--os-cyan-text)" }} aria-hidden="true" />
            Vincular a una cuenta de ahorro
          </span>
          <div role="radiogroup" aria-label="Cuenta vinculada" className={OVERFLOW_ROW}>
            <button
              type="button"
              role="radio"
              aria-checked={linkedAccountId === null}
              onClick={() => { haptic(); setLinkedAccountId(null); }}
              className={cn(
                "flex shrink-0 items-center rounded-[14px] border px-3 py-2 text-[13px] font-semibold transition-[background-color,border-color,transform] active:scale-95",
                linkedAccountId === null
                  ? "border-foreground/30 bg-muted text-foreground"
                  : "border-border bg-[var(--surface-2)] text-muted-foreground",
              )}
            >
              Progreso manual
            </button>
            {savingsAccounts.map((a) => (
              <SourceChip
                key={a._id}
                selected={linkedAccountId === a._id}
                onSelect={() => { haptic(); setLinkedAccountId(a._id); }}
                color={a.color}
                name={a.name}
                detail={formatCents(a.balance, a.currency)}
              />
            ))}
          </div>
          <p className="px-1 text-xs text-muted-foreground">
            {linkedAccountId
              ? "El avance será el saldo de esa cuenta: no se registran abonos a mano."
              : "El avance lo llevas con abonos manuales desde la lista."}
          </p>
        </div>
      )}

      {/* Descripción y notas */}
      <div className="space-y-2">
        <label htmlFor={`${formId}-desc`} className={FIELD_LABEL}>Descripción</label>
        <Input
          id={`${formId}-desc`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Opcional — el detalle de lo que quieres"
          className="h-11 rounded-[14px]"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor={`${formId}-notes`} className={FIELD_LABEL}>Nota</label>
        <Textarea
          id={`${formId}-notes`}
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          placeholder="Opcional — por qué te importa esta meta"
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
              {status === "idle" && (isEdit ? "Guardar cambios" : "Crear meta")}
            </motion.span>
          </AnimatePresence>
        </button>
      </AppSheetFooter>
    </form>
  );
}
