"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Loader2, ShieldCheck, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AppSheet, AppSheetFooter } from "@/components/ui/app-sheet";
import { SwipeRow, type SwipeAction } from "@/components/ui/swipe-row";
import { cn } from "@/lib/utils";
import {
  EASE_OUT_EXPO,
  PERMISSION_HINTS,
  PERMISSION_LABELS,
  PERMISSION_ORDER,
  SHARE_STATUS_LABELS,
  haptic,
  tint,
  type SharePermission,
} from "./shared";

export interface Share {
  _id: Id<"accountShares">;
  sharedWithUserId: string;
  permission: SharePermission;
  status: string;
  userName?: string;
  userEmail?: string;
}

/**
 * Con quién está compartida la cuenta. El permiso y el estado se mostraban como los
 * enums de la base («viewer · aceptada»); ahora van en palabras, y el nivel de
 * acceso se puede cambiar: `accountShares.updatePermission` existía sin que
 * ninguna pantalla lo llamara, así que la única salida era revocar y reinvitar.
 */
export function SharesList({ shares }: { shares: Share[] }) {
  const reduce = useReducedMotion();
  const revoke = useMutation(api.accountShares.revoke);
  const [openId, setOpenId] = useState<string | null>(null);
  const [leveling, setLeveling] = useState<Share | null>(null);

  async function handleRevoke(share: Share) {
    haptic(15);
    try {
      await revoke({ shareId: share._id });
      toast.success(`Acceso de ${labelOf(share)} revocado`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo revocar");
    }
  }

  return (
    <>
      <ul className="space-y-0.5">
        <AnimatePresence initial={false}>
          {shares.map((share, i) => {
            const pending = share.status === "pendiente";
            const actions: SwipeAction[] = [
              ...(pending
                ? []
                : [{
                    key: "level",
                    label: "Acceso",
                    icon: ShieldCheck,
                    className: "bg-[var(--os-violet-2)]",
                    onAction: () => setLeveling(share),
                  }]),
              {
                key: "revoke",
                label: "Revocar",
                icon: UserMinus,
                className: "bg-[var(--os-magenta-2)]",
                onAction: () => handleRevoke(share),
              },
            ];

            return (
              <motion.li
                key={share._id}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0, transition: { duration: 0.28, ease: EASE_OUT_EXPO } }}
                transition={{ duration: 0.35, ease: EASE_OUT_EXPO, delay: Math.min(i, 8) * 0.04 }}
                className="list-none overflow-hidden rounded-[16px]"
              >
                <SwipeRow
                  id={share._id}
                  actions={actions}
                  openId={openId}
                  setOpenId={setOpenId}
                  className="rounded-[16px]"
                >
                  <button
                    type="button"
                    onClick={() => { if (!pending) setLeveling(share); }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[16px] px-3 py-3 text-left transition-colors",
                      !pending && "hover:bg-muted/50 active:bg-muted/70",
                      pending && "opacity-75",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold"
                      style={{
                        background: tint("var(--os-cyan)", 16),
                        color: "var(--os-cyan-text)",
                      }}
                    >
                      {initialOf(labelOf(share))}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold leading-tight text-foreground">
                        {labelOf(share)}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {SHARE_STATUS_LABELS[share.status] ?? share.status}
                      </span>
                    </span>

                    <span
                      className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold"
                      style={{
                        background: tint("var(--os-violet)", 15),
                        color: "var(--os-violet-text)",
                      }}
                    >
                      {PERMISSION_LABELS[share.permission]}
                    </span>
                  </button>
                </SwipeRow>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      <PermissionSheet
        share={leveling}
        open={leveling !== null}
        onOpenChange={(open) => { if (!open) setLeveling(null); }}
      />
    </>
  );
}

/** Cambiar el nivel de acceso de alguien que ya lo tiene. */
function PermissionSheet({
  share,
  open,
  onOpenChange,
}: {
  share: Share | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <AppSheet
      open={open && share !== null}
      onOpenChange={onOpenChange}
      title="Nivel de acceso"
      description={share ? labelOf(share) : undefined}
      footer
    >
      {share && <PermissionFields key={share._id} share={share} onDone={() => onOpenChange(false)} />}
    </AppSheet>
  );
}

function PermissionFields({ share, onDone }: { share: Share; onDone: () => void }) {
  const reduce = useReducedMotion();
  const updatePermission = useMutation(api.accountShares.updatePermission);
  const [permission, setPermission] = useState<SharePermission>(share.permission);
  const [status, setStatus] = useState<"idle" | "saving" | "done">("idle");

  const changed = permission !== share.permission;

  async function handleSave() {
    if (!changed || status !== "idle") return;
    setStatus("saving");
    try {
      await updatePermission({ shareId: share._id, permission });
      haptic(15);
      setStatus("done");
      toast.success(`${labelOf(share)} ahora es ${PERMISSION_LABELS[permission].toLowerCase()}`);
      setTimeout(onDone, reduce ? 0 : 480);
    } catch (err) {
      setStatus("idle");
      toast.error(err instanceof Error ? err.message : "No se pudo cambiar");
    }
  }

  return (
    <div className="space-y-4">
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

      <AppSheetFooter>
        <button
          type="button"
          onClick={handleSave}
          disabled={!changed || status !== "idle"}
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
              {status === "idle" && (changed ? "Guardar nivel" : "Sin cambios")}
            </motion.span>
          </AnimatePresence>
        </button>
      </AppSheetFooter>
    </div>
  );
}

function labelOf(share: Share): string {
  return share.userName ?? share.userEmail ?? share.sharedWithUserId;
}

function initialOf(label: string): string {
  return label.trim().charAt(0).toUpperCase() || "?";
}
