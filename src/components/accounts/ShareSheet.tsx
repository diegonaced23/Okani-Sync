"use client";

import { useId, useState } from "react";
import { useMutation } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AppSheet, AppSheetFooter } from "@/components/ui/app-sheet";
import { Input } from "@/components/ui/input";
import { FIELD_LABEL } from "@/lib/ios";
import { cn } from "@/lib/utils";
import {
  PERMISSION_HINTS,
  PERMISSION_LABELS,
  PERMISSION_ORDER,
  haptic,
  type SharePermission,
} from "./shared";

/** Invitar a alguien a una cuenta, eligiendo qué podrá hacer. */
export function ShareSheet({
  accountId,
  accountName,
  open,
  onOpenChange,
}: {
  accountId: Id<"accounts">;
  accountName: string;
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
      title="Compartir cuenta"
      description={accountName}
      footer
    >
      <ShareFields key={session} accountId={accountId} onDone={() => onOpenChange(false)} />
    </AppSheet>
  );
}

function ShareFields({
  accountId,
  onDone,
}: {
  accountId: Id<"accounts">;
  onDone: () => void;
}) {
  const formId = useId();
  const reduce = useReducedMotion();
  const share = useMutation(api.accountShares.share);

  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<SharePermission>("viewer");
  const [status, setStatus] = useState<"idle" | "saving" | "done">("idle");

  const canSubmit = email.trim().length > 0 && status === "idle";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const to = email.trim();
    setStatus("saving");
    try {
      await share({ accountId, email: to, permission });
      haptic(15);
      setStatus("done");
      toast.success(`Invitación enviada a ${to}`);
      setTimeout(onDone, reduce ? 0 : 520);
    } catch (err) {
      setStatus("idle");
      toast.error(err instanceof Error ? err.message : "No se pudo compartir");
    }
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <label htmlFor={`${formId}-email`} className={FIELD_LABEL}>Correo de la persona</label>
        <div className="relative">
          <Mail
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id={`${formId}-email`}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="persona@ejemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-11 rounded-[14px] pl-9"
          />
        </div>
        <p className="px-1 text-xs text-muted-foreground">
          Solo puedes invitar a quien ya tenga cuenta en Okany Sync.
        </p>
      </div>

      <div className="space-y-2">
        <span className={FIELD_LABEL}>Qué podrá hacer</span>
        <div role="radiogroup" aria-label="Nivel de acceso" className="space-y-2">
          {PERMISSION_ORDER.map((level) => {
            const active = permission === level;
            return (
              <button
                key={level}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => { haptic(); setPermission(level); }}
                className={cn(
                  "flex w-full items-start gap-3 rounded-[18px] border px-4 py-3 text-left transition-[border-color,background-color,transform] active:scale-[0.98]",
                  active
                    ? "border-[var(--os-lime)]/50 bg-[color-mix(in_oklch,var(--os-lime)_10%,transparent)]"
                    : "border-border bg-[var(--surface-2)]",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                    active ? "border-transparent bg-[var(--os-lime)]" : "border-border",
                  )}
                >
                  {active && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-foreground">
                    {PERMISSION_LABELS[level]}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {PERMISSION_HINTS[level]}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
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
              {status === "saving" && <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Enviando…</>}
              {status === "done" && <><Check className="h-5 w-5" strokeWidth={3} aria-hidden="true" /> Enviada</>}
              {status === "idle" && "Enviar invitación"}
            </motion.span>
          </AnimatePresence>
        </button>
      </AppSheetFooter>
    </form>
  );
}
