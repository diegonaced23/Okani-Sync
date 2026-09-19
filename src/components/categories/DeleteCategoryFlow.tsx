"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ChevronLeft, TriangleAlert } from "lucide-react";
import type { Id } from "../../../convex/_generated/dataModel";
import { AppSheet } from "@/components/ui/app-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryIcon } from "@/components/ui/category-icon";
import { cn } from "@/lib/utils";
import { HoldToConfirmButton } from "@/components/ui/hold-to-confirm-button";
import { EASE_OUT_EXPO, haptic, isTypeCompatible, tint, type Category } from "./shared";

/**
 * Eliminar una categoría archivada. Sin movimientos: se confirma manteniendo
 * presionado. Con movimientos: primero se elige a qué categoría migrarlos.
 */
export function DeleteCategoryFlow({
  deletingCat,
  txCount,
  activeCategories,
  onClose,
  onRemove,
  onMigrate,
}: {
  deletingCat: Category | null;
  txCount: number | undefined;
  activeCategories: Category[];
  onClose: () => void;
  onRemove: () => Promise<void>;
  onMigrate: (targetId: Id<"categories">) => Promise<void>;
}) {
  const reduce = useReducedMotion();
  const [migrationTarget, setMigrationTarget] = useState<Id<"categories"> | null>(null);
  const [step, setStep] = useState<"select" | "confirm">("select");
  const [loading, setLoading] = useState(false);

  // Resetear estado al cambiar categoría (durante render, sin efecto)
  const [prevCatId, setPrevCatId] = useState(deletingCat?._id);
  if (deletingCat?._id !== prevCatId) {
    setPrevCatId(deletingCat?._id);
    setMigrationTarget(null);
    setStep("select");
    setLoading(false);
  }

  const countLabel = txCount === 501 ? "más de 500" : String(txCount ?? 0);
  const compatibleTargets = deletingCat
    ? activeCategories.filter(
        (c) => c._id !== deletingCat._id && isTypeCompatible(deletingCat.type, c.type)
      )
    : [];
  const targetCat = compatibleTargets.find((c) => c._id === migrationTarget);

  async function run(fn: () => Promise<void>) {
    setLoading(true);
    try {
      await fn();
      onClose();
    } catch {
      // El toast de error lo muestra quien ejecuta la mutación
    } finally {
      setLoading(false);
    }
  }

  const slide = {
    initial: reduce ? { opacity: 0 } : { opacity: 0, x: 24 },
    animate: { opacity: 1, x: 0 },
    exit: reduce ? { opacity: 0 } : { opacity: 0, x: -24 },
    transition: { duration: 0.28, ease: EASE_OUT_EXPO },
  };

  return (
    <AppSheet
      open={deletingCat !== null}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={txCount ? "Categoría con movimientos" : "Eliminar categoría"}
    >
      {deletingCat && (
        <div className="space-y-5">
          <CatHeader cat={deletingCat} />

          {txCount === undefined && (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full rounded-2xl" />
              <Skeleton className="h-12 w-full rounded-2xl" />
            </div>
          )}

          {txCount === 0 && (
            <motion.div {...slide} className="space-y-4">
              <Warning>
                Esta acción es <strong>irreversible</strong>. La categoría no se podrá recuperar.
              </Warning>
              <HoldToConfirmButton
                label="Mantén presionado para eliminar"
                busyLabel="Eliminando…"
                busy={loading}
                onConfirm={() => run(onRemove)}
              />
            </motion.div>
          )}

          {txCount !== undefined && txCount > 0 && (
            <AnimatePresence mode="wait" initial={false}>
              {step === "select" ? (
                <motion.div key="select" {...slide} className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Tiene <strong className="text-foreground">{countLabel} movimientos</strong>. Elige a
                    qué categoría pasarlos antes de eliminarla.
                  </p>

                  {compatibleTargets.length === 0 ? (
                    <p className="rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
                      No tienes otra categoría activa compatible. Crea una primero.
                    </p>
                  ) : (
                    <div role="radiogroup" aria-label="Categoría destino" className="grid grid-cols-2 gap-2">
                      {compatibleTargets.map((c) => {
                        const selected = migrationTarget === c._id;
                        return (
                          <button
                            key={c._id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => { haptic(); setMigrationTarget(c._id); }}
                            className={cn(
                              "flex min-w-0 items-center gap-2 rounded-[14px] border px-2.5 py-2 text-left text-sm font-semibold transition-[background-color,border-color,transform] active:scale-[0.97]",
                              selected ? "text-foreground" : "border-border bg-[var(--surface-2)] text-muted-foreground",
                            )}
                            style={selected ? { background: tint(c.color, 16), borderColor: tint(c.color, 60) } : undefined}
                          >
                            <span
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px]"
                              style={{ background: tint(c.color, 18), color: c.color }}
                            >
                              <CategoryIcon name={c.icon} className="h-3.5 w-3.5" aria-hidden="true" />
                            </span>
                            <span className="truncate">{c.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={!migrationTarget}
                    onClick={() => setStep("confirm")}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-foreground text-[15px] font-bold text-background transition-[opacity,transform] active:scale-[0.98] disabled:opacity-30"
                  >
                    Continuar <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </motion.div>
              ) : targetCat ? (
                <motion.div key="confirm" {...slide} className="space-y-4">
                  <MigrationVisual from={deletingCat} to={targetCat} count={countLabel} />
                  <Warning>
                    Se moverán <strong>{countLabel} movimientos</strong> a <strong>{targetCat.name}</strong> y
                    se eliminará <strong>{deletingCat.name}</strong>. No se puede deshacer.
                  </Warning>
                  <HoldToConfirmButton
                    label="Mantén para migrar y eliminar"
                    busyLabel="Migrando…"
                    busy={loading}
                    onConfirm={() => run(() => onMigrate(targetCat._id))}
                  />
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => setStep("select")}
                    className="flex w-full items-center justify-center gap-1 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Elegir otra
                  </button>
                </motion.div>
              ) : null}
            </AnimatePresence>
          )}
        </div>
      )}
    </AppSheet>
  );
}

function CatHeader({ cat }: { cat: Category }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-[var(--surface-2)] px-3 py-2.5">
      <span
        className="flex h-10 w-10 items-center justify-center rounded-[12px]"
        style={{ background: tint(cat.color, 18), color: cat.color }}
      >
        <CategoryIcon name={cat.icon} className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="truncate text-[15px] font-bold text-foreground">{cat.name}</span>
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      <p className="text-sm text-destructive">{children}</p>
    </div>
  );
}

/** Dos burbujas y puntos que viajan de una a otra: "estos movimientos van allá". */
function MigrationVisual({ from, to, count }: { from: Category; to: Category; count: string }) {
  const reduce = useReducedMotion();
  return (
    <div className="flex items-center justify-between gap-2 rounded-2xl bg-[var(--surface-2)] px-4 py-4" aria-hidden="true">
      <Bubble cat={from} faded />
      <div className="relative flex h-10 flex-1 items-center">
        <span className="h-px w-full bg-border" />
        {!reduce && [0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="absolute h-2 w-2 rounded-full"
            style={{ background: to.color }}
            initial={{ left: "0%", opacity: 0 }}
            animate={{ left: ["0%", "100%"], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.45, ease: "easeInOut" }}
          />
        ))}
        <span className="absolute inset-x-0 -top-1 text-center text-[11px] font-bold text-muted-foreground">
          {count}
        </span>
      </div>
      <Bubble cat={to} />
    </div>
  );
}

function Bubble({ cat, faded }: { cat: Category; faded?: boolean }) {
  return (
    <div className={cn("flex w-20 flex-col items-center gap-1.5", faded && "opacity-60")}>
      <span
        className="flex h-11 w-11 items-center justify-center rounded-[14px]"
        style={{ background: tint(cat.color, 18), color: cat.color }}
      >
        <CategoryIcon name={cat.icon} className="h-5 w-5" />
      </span>
      <span className="w-full truncate text-center text-xs font-semibold text-foreground">{cat.name}</span>
    </div>
  );
}
