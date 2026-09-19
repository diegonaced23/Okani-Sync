"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { CategoryIcon } from "@/components/ui/category-icon";
import { DEFAULT_CATEGORIES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { GLASS_SURFACE, tint, type CategoryTab } from "./shared";

/**
 * Pestaña sin categorías: los íconos por defecto flotan alrededor de una burbuja
 * central y se ofrece crearlas de un toque.
 */
export function EmptyState({
  tab,
  seeding,
  query,
  onSeed,
  onCreate,
}: {
  tab: CategoryTab;
  seeding: boolean;
  /** Búsqueda activa sin resultados: otro mensaje y sin ofrecer sugeridas */
  query: string;
  onSeed: () => void;
  onCreate: () => void;
}) {
  const reduce = useReducedMotion();
  const defaults = DEFAULT_CATEGORIES.filter((c) => c.type === tab).slice(0, 6);

  if (query) {
    return (
      <div className={cn("rounded-[24px] px-6 py-10 text-center", GLASS_SURFACE)}>
        <p className="text-sm font-semibold text-foreground">Sin resultados para «{query}»</p>
        <p className="mt-1 text-xs text-muted-foreground">Prueba con otro nombre.</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={cn("relative overflow-hidden rounded-[28px] px-6 pb-7 pt-8 text-center", GLASS_SURFACE)}
    >
      {/* Órbita de íconos */}
      <div className="relative mx-auto mb-6 h-36 w-36" aria-hidden="true">
        <span className="absolute inset-0 rounded-full border border-dashed border-border" />
        <span className="absolute inset-6 rounded-full border border-border/60" />
        <motion.div
          className="absolute inset-0"
          animate={reduce ? undefined : { rotate: 360 }}
          transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
        >
          {defaults.map((c, i) => {
            const angle = (i / defaults.length) * Math.PI * 2 - Math.PI / 2;
            return (
              <motion.span
                key={c.name}
                className="absolute flex h-9 w-9 items-center justify-center rounded-[12px] border border-white/40 backdrop-blur-md dark:border-white/10"
                style={{
                  left: `calc(50% + ${Math.cos(angle) * 72}px - 18px)`,
                  top: `calc(50% + ${Math.sin(angle) * 72}px - 18px)`,
                  background: tint(c.color, 20),
                  color: c.color,
                }}
                initial={reduce ? false : { scale: 0, opacity: 0 }}
                animate={reduce ? { opacity: 1 } : { scale: 1, opacity: 1, rotate: -360 }}
                transition={{
                  scale: { delay: 0.1 + i * 0.07, type: "spring", stiffness: 500, damping: 20 },
                  opacity: { delay: 0.1 + i * 0.07 },
                  // Contra-rotación: los íconos se mantienen derechos mientras orbitan
                  rotate: { duration: 40, repeat: Infinity, ease: "linear" },
                }}
              >
                <CategoryIcon name={c.icon} className="h-4 w-4" />
              </motion.span>
            );
          })}
        </motion.div>
        <span className="absolute inset-[38px] flex items-center justify-center rounded-[22px] bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-[0_12px_30px_-10px_rgb(16_185_129/0.7)]">
          <Sparkles className="h-7 w-7" />
        </span>
      </div>

      <h2 className="text-lg font-extrabold tracking-tight text-foreground">
        {tab === "gasto" ? "Organiza tus gastos" : "Organiza tus ingresos"}
      </h2>
      <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground">
        Las categorías te muestran en qué se va tu dinero. Empieza con las sugeridas o crea las tuyas.
      </p>

      <div className="mt-6 flex flex-col gap-2">
        <button
          type="button"
          onClick={onSeed}
          disabled={seeding}
          className="flex h-12 items-center justify-center gap-2 rounded-[16px] bg-gradient-to-r from-emerald-400 to-teal-500 text-[15px] font-bold text-white shadow-[0_10px_24px_-10px_rgb(16_185_129/0.8)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-60"
        >
          {seeding
            ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Agregando…</>
            : <><Sparkles className="h-4 w-4" aria-hidden="true" /> Agregar sugeridas</>}
        </button>
        <button
          type="button"
          onClick={onCreate}
          className="flex h-11 items-center justify-center gap-1.5 rounded-[16px] text-sm font-semibold text-foreground transition-colors hover:bg-muted/60"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Crear una propia
        </button>
      </div>
    </motion.div>
  );
}
