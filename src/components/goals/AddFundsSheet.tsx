"use client";

import { useId, useState } from "react";
import { useMutation } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Loader2, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { AppSheet, AppSheetFooter } from "@/components/ui/app-sheet";
import { MoneyInput } from "@/components/ui/money-input";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Segmented } from "@/components/ui/segmented";
import { haptic, tint } from "@/lib/ios";
import { formatCents, fromCents, toCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { viewOf, type Goal } from "./shared";

type Mode = "abonar" | "retirar";

/**
 * Abonar o retirar de una meta. El anillo anticipa el progreso con el monto escrito
 * y, si el abono la cumple, se celebra antes de cerrar: es el único momento del
 * módulo que vale la pena festejar.
 */
export function AddFundsSheet({
  goal,
  open,
  onOpenChange,
}: {
  goal: Goal | null;
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
      open={open && goal !== null}
      onOpenChange={onOpenChange}
      title="Abonar a la meta"
      description={goal?.name}
      footer
    >
      {goal && <FundsForm key={`${goal._id}-${session}`} goal={goal} onDone={() => onOpenChange(false)} />}
    </AppSheet>
  );
}

function FundsForm({ goal, onDone }: { goal: Goal; onDone: () => void }) {
  const formId = useId();
  const reduce = useReducedMotion();
  const addFunds = useMutation(api.goals.addFunds);
  const { saved, currency, progress, remaining } = viewOf(goal);

  const [mode, setMode] = useState<Mode>("abonar");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "reached">("idle");

  const cents = amount ? toCents(parseFloat(amount)) : 0;
  const abonar = mode === "abonar";
  const tooMuch = !abonar && cents > saved;
  const after = abonar ? saved + cents : Math.max(0, saved - cents);
  const reaches = abonar && cents > 0 && after >= goal.targetAmount;
  const afterProgress = goal.targetAmount > 0 ? Math.min(after / goal.targetAmount, 1) : 0;
  const tone = reaches || status === "reached" ? "var(--os-lime)" : goal.color;
  const canSubmit = cents > 0 && !tooMuch && status === "idle";

  const quick = abonar
    ? [
        ...(remaining > 1 ? [{ label: "Mitad de lo que falta", value: Math.round(remaining / 2) }] : []),
        ...(remaining > 0 ? [{ label: "Completar la meta", value: remaining }] : []),
      ]
    : [
        ...(saved > 1 ? [{ label: "La mitad", value: Math.round(saved / 2) }] : []),
        ...(saved > 0 ? [{ label: "Todo", value: saved }] : []),
      ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus("saving");
    try {
      await addFunds({ goalId: goal._id, delta: abonar ? cents : -cents });
      haptic(reaches ? 40 : 12);
      setStatus(reaches ? "reached" : "done");
      toast.success(reaches ? `¡Cumpliste «${goal.name}»!` : abonar ? "Abono registrado" : "Retiro registrado");
      setTimeout(onDone, reduce ? 0 : reaches ? 1500 : 520);
    } catch (err) {
      setStatus("idle");
      toast.error(err instanceof Error ? err.message : "No se pudo registrar");
    }
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-6">
      <div
        className="relative overflow-hidden rounded-[24px] border border-white/40 px-4 pb-4 pt-5 text-center dark:border-white/10"
        style={{ background: `linear-gradient(160deg, ${tint(tone, 14)}, transparent 70%)` }}
      >
        {status === "reached" && <Confetti />}

        <div className="relative mx-auto w-fit">
          <ProgressRing
            value={status === "reached" ? 1 : progress}
            preview={afterProgress}
            color={tone}
            size={112}
            stroke={9}
          >
            <AnimatePresence mode="wait" initial={false}>
              {status === "reached" ? (
                <motion.span
                  key="reached"
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
                  <span className="text-2xl">{goal.icon}</span>
                  <span className="mt-1 font-mono-num text-[13px] font-extrabold tabular-nums text-foreground">
                    {Math.round(afterProgress * 100)}%
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
            className="h-auto w-full max-w-[13rem] border-none bg-transparent p-0 text-center font-mono-num shadow-none focus-visible:ring-0"
            style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em" }}
          />
          <span className="rounded-full bg-background/60 px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
            {currency}
          </span>
        </div>

        <p
          className={cn("mt-1 text-xs font-medium", tooMuch ? "text-destructive" : "text-muted-foreground")}
          role={tooMuch ? "alert" : undefined}
        >
          {tooMuch
            ? `Solo llevas ahorrado ${formatCents(saved, currency)}`
            : reaches
              ? "Con este abono cumples la meta 🎉"
              : <>Llevas {formatCents(saved, currency)} de {formatCents(goal.targetAmount, currency)}</>}
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
        )}
      </div>

      <Segmented
        label="Tipo de movimiento"
        value={mode}
        onChange={(m) => { haptic(); setMode(m); setAmount(""); }}
        options={[
          { value: "abonar", label: "Abonar" },
          { value: "retirar", label: "Retirar" },
        ]}
      />

      <AppSheetFooter>
        <button
          type="submit"
          form={formId}
          disabled={!canSubmit}
          className={cn(
            "relative flex h-12 w-full items-center justify-center overflow-hidden rounded-[16px] text-[15px] font-bold transition-[opacity,transform] active:scale-[0.98] disabled:opacity-40",
            abonar
              ? "bg-gradient-to-r from-emerald-400 to-teal-500 text-white shadow-[0_10px_24px_-10px_rgb(16_185_129/0.8)]"
              : "border border-border bg-[var(--surface-2)] text-foreground",
          )}
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
              {(status === "done" || status === "reached") && (
                <><Check className="h-5 w-5" strokeWidth={3} aria-hidden="true" /> {status === "reached" ? "¡Cumplida!" : "Listo"}</>
              )}
              {status === "idle" && (cents > 0
                ? `${abonar ? "Abonar" : "Retirar"} ${formatCents(cents, currency)}`
                : abonar ? "Registrar abono" : "Registrar retiro")}
            </motion.span>
          </AnimatePresence>
        </button>
      </AppSheetFooter>
    </form>
  );
}

// ─── Celebración ──────────────────────────────────────────────────────────────

/** Ángulos fijos: una ráfaga repetible es preferible a un Math.random() que rompería el render. */
const PARTICLES = Array.from({ length: 16 }, (_, i) => {
  const angle = (i / 16) * Math.PI * 2;
  return {
    x: Math.cos(angle) * (58 + (i % 3) * 16),
    y: Math.sin(angle) * (58 + (i % 3) * 16),
    color: ["var(--os-lime)", "var(--os-cyan)", "var(--os-orange)", "var(--os-violet)"][i % 4],
    delay: (i % 5) * 0.03,
  };
});

function Confetti() {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-[76px] z-10 h-0 w-0">
      {PARTICLES.map((p, i) => (
        <motion.span
          key={i}
          className="absolute h-1.5 w-1.5 rounded-full"
          style={{ background: p.color }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0.6 }}
          animate={{ x: p.x, y: p.y, opacity: 0, scale: 1.1 }}
          transition={{ duration: 0.95, delay: p.delay, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}
    </span>
  );
}
