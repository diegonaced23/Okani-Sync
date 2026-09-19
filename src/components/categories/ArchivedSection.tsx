"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronRight, RotateCcw, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryIcon } from "@/components/ui/category-icon";
import { cn } from "@/lib/utils";
import { EASE_OUT_EXPO, GLASS_SURFACE, TYPE_LABELS, tint, type Category } from "./shared";

export function ArchivedSection({
  open,
  onToggle,
  archived,
  onRestore,
  onDelete,
}: {
  open: boolean;
  onToggle: () => void;
  archived: Category[] | undefined;
  onRestore: (cat: Category) => void;
  onDelete: (cat: Category) => void;
}) {
  const reduce = useReducedMotion();

  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-1 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground pointer-coarse:min-h-11"
      >
        <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.2 }} className="flex">
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </motion.span>
        Archivadas
        {archived !== undefined && (
          <span className="rounded-full bg-muted px-1.5 text-[11px] font-bold tabular-nums">{archived.length}</span>
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
            className="overflow-hidden"
          >
            <div className={cn("rounded-[24px] p-1.5", GLASS_SURFACE)}>
              {archived === undefined ? (
                <div className="space-y-1.5 p-1.5">
                  {[1, 2].map((i) => <Skeleton key={i} className="h-11 rounded-xl" />)}
                </div>
              ) : archived.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">No hay categorías archivadas</p>
              ) : (
                <ul>
                  <AnimatePresence initial={false}>
                    {archived.map((cat) => (
                      <motion.li
                        key={cat._id}
                        layout={!reduce}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                        className="flex items-center gap-3 rounded-[16px] px-2.5 py-2"
                      >
                        <span
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] grayscale-[0.6]"
                          style={{ background: tint(cat.color, 14), color: cat.color }}
                        >
                          <CategoryIcon name={cat.icon} className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-muted-foreground">{cat.name}</span>
                          <span className="block text-[11px] text-muted-foreground/70">{TYPE_LABELS[cat.type]}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => onRestore(cat)}
                          className="touch-hit flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground transition-[background-color,transform] hover:bg-muted/70 active:scale-95"
                        >
                          <RotateCcw className="h-3 w-3" aria-hidden="true" /> Restaurar
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(cat)}
                          aria-label={`Eliminar ${cat.name}`}
                          className="touch-hit flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
