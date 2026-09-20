"use client";

import { useId, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { AppSheet, AppSheetFooter } from "@/components/ui/app-sheet";
import { MoneyInput } from "@/components/ui/money-input";
import { formatCents, fromCents, toCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { haptic, tint, type Account } from "./shared";

/**
 * Poner el saldo en la cifra que dice el banco. Hay dos caminos y la diferencia
 * importa: si la cuenta tiene movimientos se registra un ajuste en el historial,
 * y si no los tiene se corrige el saldo sin dejar rastro.
 */
export function BalanceSheet({
  account,
  open,
  onOpenChange,
}: {
  account: Account;
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
      title="Ajustar saldo"
      description={account.name}
      footer
    >
      <BalanceFields key={session} account={account} onDone={() => onOpenChange(false)} />
    </AppSheet>
  );
}

function BalanceFields({ account, onDone }: { account: Account; onDone: () => void }) {
  const formId = useId();
  const reduce = useReducedMotion();
  const hasTx = useQuery(api.accounts.hasTransactions, { accountId: account._id });
  const reassign = useMutation(api.accounts.reassignBalance);
  const correct = useMutation(api.accounts.correctBalance);

  const [value, setValue] = useState(String(fromCents(account.balance)));
  const [status, setStatus] = useState<"idle" | "saving" | "done">("idle");

  const parsed = parseFloat(value.replace(/[^0-9.-]/g, ""));
  const cents = Number.isFinite(parsed) ? toCents(parsed) : NaN;
  const isValid = Number.isInteger(cents) && cents >= 0;
  const delta = isValid ? cents - account.balance : 0;
  const noChange = isValid && delta === 0;
  const ready = hasTx !== undefined;
  const canSubmit = isValid && !noChange && ready && status === "idle";
  const tone = delta > 0 ? "var(--os-lime)" : "var(--os-magenta)";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus("saving");
    try {
      if (hasTx) {
        await reassign({ accountId: account._id, newBalance: cents });
      } else {
        await correct({ accountId: account._id, newBalance: cents });
      }
      haptic(15);
      setStatus("done");
      toast.success(
        hasTx
          ? `Saldo ajustado ${delta > 0 ? "+" : "−"}${formatCents(Math.abs(delta), account.currency)}`
          : `Saldo corregido a ${formatCents(cents, account.currency)}`
      );
      setTimeout(onDone, reduce ? 0 : 480);
    } catch (err) {
      setStatus("idle");
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar");
    }
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-6">
      {/* El saldo nuevo se escribe en grande, con la diferencia debajo */}
      <div
        className="relative overflow-hidden rounded-[24px] border border-white/40 px-4 pb-4 pt-5 text-center dark:border-white/10"
        style={{
          background: `linear-gradient(160deg, ${tint(isValid && !noChange ? tone : "var(--os-cyan)", 12)}, transparent 70%)`,
        }}
      >
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          Saldo registrado hoy
        </p>
        <p className="mt-1 font-mono-num text-[15px] font-bold tabular-nums text-foreground">
          {formatCents(account.balance, account.currency)}
        </p>

        <label htmlFor={`${formId}-balance`} className="sr-only">Nuevo saldo</label>
        <div className="mt-4 flex items-baseline justify-center gap-1.5">
          <MoneyInput
            id={`${formId}-balance`}
            value={value}
            onChange={setValue}
            placeholder="0"
            inputMode="decimal"
            required
            aria-invalid={!isValid || undefined}
            className="h-auto w-full max-w-[14rem] border-none bg-transparent p-0 text-center font-mono-num shadow-none focus-visible:ring-0"
            style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em" }}
          />
          <span className="rounded-full bg-background/60 px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
            {account.currency}
          </span>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={noChange ? "same" : !isValid ? "invalid" : delta > 0 ? "up" : "down"}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="mt-2 text-sm font-bold"
            style={{ color: isValid && !noChange ? tone : undefined }}
          >
            {!isValid
              ? <span className="text-muted-foreground">Escribe un saldo válido</span>
              : noChange
                ? <span className="text-muted-foreground">Sin cambios en el saldo</span>
                : <>{delta > 0 ? "+" : "−"}{formatCents(Math.abs(delta), account.currency)}</>}
          </motion.p>
        </AnimatePresence>

        <p className={cn("mt-1 text-xs text-muted-foreground", !ready && "opacity-0")}>
          {hasTx
            ? "Queda un movimiento de ajuste en el historial."
            : "La cuenta no tiene movimientos: se corrige sin dejar registro."}
        </p>
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
              {status === "saving" && <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Aplicando…</>}
              {status === "done" && <><Check className="h-5 w-5" strokeWidth={3} aria-hidden="true" /> Listo</>}
              {status === "idle" && (hasTx === false ? "Corregir saldo" : "Confirmar ajuste")}
            </motion.span>
          </AnimatePresence>
        </button>
      </AppSheetFooter>
    </form>
  );
}
