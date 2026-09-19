"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, Reorder, motion, useReducedMotion } from "framer-motion";
import { Check, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PageContainer } from "@/components/layout/PageContainer";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryRow, type RowStats } from "@/components/categories/CategoryRow";
import { CategorySheet } from "@/components/categories/CategorySheet";
import { DeleteCategoryFlow } from "@/components/categories/DeleteCategoryFlow";
import { ArchivedSection } from "@/components/categories/ArchivedSection";
import { EmptyState } from "@/components/categories/EmptyState";
import {
  EASE_OUT_EXPO,
  GLASS_SURFACE,
  SPRING,
  haptic,
  inTab,
  type Category,
  type CategoryTab,
} from "@/components/categories/shared";
import { currentMonth, formatCents, formatMonth } from "@/lib/money";
import { cn } from "@/lib/utils";

const TABS: { key: CategoryTab; label: string }[] = [
  { key: "gasto", label: "Gastos" },
  { key: "ingreso", label: "Ingresos" },
];

/** Con más filas que esto aparece el buscador */
const SEARCH_THRESHOLD = 8;

export default function CategoriasPage() {
  const reduce = useReducedMotion();
  const month = currentMonth();

  const categories = useQuery(api.categories.list, {});
  const monthStats = useQuery(api.categories.monthStats, { month });
  const archiveCategory = useMutation(api.categories.archive);
  const unarchiveCategory = useMutation(api.categories.unarchive);
  const reorderCategories = useMutation(api.categories.reorder);
  const removeCategory = useMutation(api.categories.remove);
  const migrateAndDeleteMutation = useMutation(api.categories.migrateAndDelete);
  const seedDefaults = useMutation(api.categories.seedDefaults);

  const [tab, setTab] = useState<CategoryTab>("gasto");
  const [editing, setEditing] = useState(false);
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [seeding, setSeeding] = useState(false);

  // Hoja de crear/editar
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);

  // Archivadas y eliminación
  const [showArchived, setShowArchived] = useState(false);
  const [deletingCat, setDeletingCat] = useState<Category | null>(null);
  const archivedCategories = useQuery(api.categories.listArchived, showArchived ? {} : "skip");
  const txCount = useQuery(
    api.categories.transactionCount,
    deletingCat ? { categoryId: deletingCat._id } : "skip"
  );

  // ── Orden local optimista por pestaña ─────────────────────────────────────
  const [items, setItems] = useState<Category[]>([]);
  const itemsRef = useRef<Category[]>([]);
  const [prevSource, setPrevSource] = useState<{ categories: typeof categories; tab: CategoryTab }>();
  if (prevSource?.categories !== categories || prevSource?.tab !== tab) {
    setPrevSource({ categories, tab });
    if (categories !== undefined) setItems(categories.filter((c) => inTab(c, tab)));
  }
  useEffect(() => { itemsRef.current = items; }, [items]);

  // ── Estadísticas del mes por pestaña ──────────────────────────────────────
  const side = tab === "gasto" ? "expense" : "income";
  const { rowStats, tabTotal, tabCount } = useMemo(() => {
    const stats = monthStats?.stats ?? {};
    let total = 0;
    let count = 0;
    for (const c of items) {
      const s = stats[c._id];
      if (!s) continue;
      total += s[side];
      count += s[side] > 0 ? 1 : 0;
    }
    const map = new Map<string, RowStats>();
    for (const c of items) {
      const s = stats[c._id];
      if (!s) continue;
      const amount = s[side];
      // "ambos" cuenta los movimientos de los dos lados; se muestra solo si hay monto en este
      if (amount <= 0) continue;
      map.set(c._id, { amount, count: s.count, share: total > 0 ? amount / total : 0 });
    }
    return { rowStats: map, tabTotal: total, tabCount: count };
  }, [monthStats, items, side]);

  const tabCounts = useMemo(
    () => ({
      gasto: categories?.filter((c) => inTab(c, "gasto")).length ?? 0,
      ingreso: categories?.filter((c) => inTab(c, "ingreso")).length ?? 0,
    }),
    [categories]
  );

  const existingNames = useMemo(
    () => new Set((categories ?? []).map((c) => c.name.trim().toLowerCase())),
    [categories]
  );

  const q = query.trim().toLowerCase();
  const visible = q ? items.filter((c) => c.name.toLowerCase().includes(q)) : items;
  const showSearch = items.length > SEARCH_THRESHOLD || q.length > 0;
  const canReorder = items.length > 1 && !q;

  // ── Acciones ──────────────────────────────────────────────────────────────

  function switchTab(next: CategoryTab) {
    if (next === tab) return;
    haptic();
    setTab(next);
    setOpenRowId(null);
    setQuery("");
    setEditing(false);
  }

  function openCreate() {
    setOpenRowId(null);
    setEditingCat(null);
    setSheetOpen(true);
  }

  function openEdit(cat: Category) {
    setEditingCat(cat);
    setSheetOpen(true);
  }

  async function handleArchive(cat: Category) {
    haptic(15);
    // Se quita de la lista al instante; Convex la confirma (o la devuelve si falla)
    setItems((prev) => prev.filter((c) => c._id !== cat._id));
    try {
      await archiveCategory({ categoryId: cat._id });
      toast(`«${cat.name}» archivada`, {
        action: {
          label: "Deshacer",
          onClick: () => {
            unarchiveCategory({ categoryId: cat._id }).catch(() =>
              toast.error("No se pudo restaurar")
            );
          },
        },
      });
    } catch (err) {
      if (categories) setItems(categories.filter((c) => inTab(c, tab)));
      toast.error(err instanceof Error ? err.message : "No se pudo archivar");
    }
  }

  async function handleRestore(cat: Category) {
    try {
      await unarchiveCategory({ categoryId: cat._id });
      haptic();
      toast.success(`«${cat.name}» restaurada`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo restaurar");
    }
  }

  async function handleSeed() {
    setSeeding(true);
    try {
      const { added } = await seedDefaults({ type: tab });
      haptic(15);
      toast.success(added > 0 ? `${added} categorías agregadas` : "Ya tienes todas las sugeridas");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudieron agregar");
    } finally {
      setSeeding(false);
    }
  }

  function handleReorderEnd() {
    haptic(8);
    reorderCategories({ categoryIds: itemsRef.current.map((c) => c._id) }).catch(() =>
      toast.error("No se pudo guardar el orden")
    );
  }

  async function handleRemove() {
    if (!deletingCat) return;
    try {
      await removeCategory({ categoryId: deletingCat._id });
      toast.success("Categoría eliminada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo eliminar");
      throw err;
    }
  }

  async function handleMigrateAndDelete(targetId: Id<"categories">) {
    if (!deletingCat) return;
    try {
      const result = await migrateAndDeleteMutation({
        categoryId: deletingCat._id,
        targetCategoryId: targetId,
      });
      toast.success(
        result?.willContinue ? "Migrando movimientos…" : "Movimientos migrados y categoría eliminada"
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo migrar");
      throw err;
    }
  }

  const isLoading = categories === undefined;
  const tabIndex = TABS.findIndex((t) => t.key === tab);

  return (
    <PageContainer className="space-y-5">
      {/* Título grande estilo iOS */}
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-foreground">Categorías</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading ? " " : `${categories.length} activas · ${formatMonth(month)}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <AnimatePresence initial={false}>
            {(editing || canReorder) && (
              <motion.button
                type="button"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => { haptic(); setOpenRowId(null); setEditing((v) => !v); }}
                aria-pressed={editing}
                className={cn(
                  "touch-hit flex h-9 items-center gap-1 rounded-full px-3.5 text-sm font-semibold transition-colors",
                  editing ? "bg-foreground text-background" : "bg-muted/80 text-foreground hover:bg-muted",
                )}
              >
                {editing ? <><Check className="h-4 w-4" aria-hidden="true" /> Listo</> : "Ordenar"}
              </motion.button>
            )}
          </AnimatePresence>
          <button
            type="button"
            onClick={openCreate}
            aria-label="Nueva categoría"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-[0_8px_20px_-8px_rgb(16_185_129/0.9)] transition-transform active:scale-90"
          >
            <Plus className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Pestañas con indicador que se desliza; fijas bajo el header al hacer scroll */}
      <div className="sticky top-[calc(64px+env(safe-area-inset-top))] z-30 lg:top-4">
        <div
          role="tablist"
          aria-label="Tipo de categoría"
          className={cn("flex rounded-[18px] p-1", GLASS_SURFACE, "md:bg-[color-mix(in_oklch,var(--card)_85%,transparent)] md:backdrop-blur-xl")}
        >
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`cat-tab-${t.key}`}
                aria-selected={active}
                aria-controls="cat-panel"
                onClick={() => switchTab(t.key)}
                className={cn(
                  "touch-hit relative flex flex-1 items-center justify-center gap-1.5 rounded-[14px] py-2 text-sm transition-colors",
                  active ? "font-bold text-foreground" : "font-semibold text-muted-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="cat-tab-pill"
                    className="absolute inset-0 rounded-[14px] bg-[var(--surface)] shadow-[0_2px_10px_-4px_rgb(0_0_0/0.25)] dark:bg-white/10"
                    transition={SPRING}
                  />
                )}
                <span className="relative">{t.label}</span>
                <span
                  className={cn(
                    "relative rounded-full px-1.5 text-[11px] font-bold tabular-nums transition-colors",
                    active
                      ? t.key === "gasto" ? "bg-[var(--os-magenta)]/15 text-[var(--os-magenta)]" : "bg-[var(--os-lime)]/20 text-lime-text"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {tabCounts[t.key]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div id="cat-panel" role="tabpanel" aria-labelledby={`cat-tab-${tab}`} className="relative space-y-3">
        {isLoading ? (
          <div className={cn("space-y-1.5 rounded-[24px] p-2", GLASS_SURFACE)}>
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 rounded-[16px]" />)}
          </div>
        ) : (
          <AnimatePresence mode="popLayout" initial={false}>
            {/* Gastos entra y sale por la izquierda, Ingresos por la derecha */}
            <motion.div
              key={tab}
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: tabIndex === 0 ? -28 : 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: tabIndex === 0 ? -28 : 28 }}
              transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
              className="space-y-3"
            >
              {/* Resumen del mes */}
              {items.length > 0 && (
                <div className="flex items-baseline justify-between px-1">
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    {editing ? "Arrastra para ordenar" : tab === "gasto" ? "Gastado este mes" : "Recibido este mes"}
                  </p>
                  {!editing && (
                    <div className="font-mono-num text-sm font-bold tabular-nums text-foreground">
                      {monthStats === undefined
                        ? <Skeleton className="h-4 w-20" />
                        : <>
                            {formatCents(tabTotal, monthStats.currency)}
                            <span className="ml-1 font-sans text-xs font-medium text-muted-foreground">
                              en {tabCount} {tabCount === 1 ? "categoría" : "categorías"}
                            </span>
                          </>}
                    </div>
                  )}
                </div>
              )}

              {/* Buscador */}
              <AnimatePresence initial={false}>
                {showSearch && !editing && (
                  <motion.label
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="relative block overflow-hidden"
                  >
                    <span className="sr-only">Buscar categoría</span>
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Buscar"
                      enterKeyHint="search"
                      className="h-10 w-full rounded-[14px] border-0 bg-muted/70 pl-10 pr-9 text-[15px] text-foreground outline-none ring-ring/50 placeholder:text-muted-foreground focus-visible:ring-2 [&::-webkit-search-cancel-button]:hidden"
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={() => setQuery("")}
                        aria-label="Limpiar búsqueda"
                        className="touch-hit absolute right-2.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-muted-foreground/30 text-background"
                      >
                        <X className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                      </button>
                    )}
                  </motion.label>
                )}
              </AnimatePresence>

              {visible.length === 0 ? (
                <EmptyState
                  tab={tab}
                  query={query.trim()}
                  seeding={seeding}
                  onSeed={handleSeed}
                  onCreate={openCreate}
                />
              ) : (
                <div className={cn("rounded-[24px] p-1.5", GLASS_SURFACE)}>
                  <Reorder.Group
                    as="ul"
                    axis="y"
                    values={visible}
                    onReorder={(next: Category[]) => {
                      // Solo se reordena sin búsqueda activa, así que `visible` es la lista completa
                      setItems(next);
                      itemsRef.current = next;
                    }}
                    className="space-y-0.5"
                  >
                    <AnimatePresence initial={false}>
                      {visible.map((cat, i) => (
                        <CategoryRow
                          key={cat._id}
                          cat={cat}
                          index={i}
                          stats={rowStats.get(cat._id)}
                          currency={monthStats?.currency ?? "COP"}
                          editing={editing}
                          openId={openRowId}
                          setOpenId={setOpenRowId}
                          onEdit={() => openEdit(cat)}
                          onArchive={() => handleArchive(cat)}
                          onLocked={() => toast.info("Las categorías del sistema no se pueden editar")}
                          onDragEnd={handleReorderEnd}
                        />
                      ))}
                    </AnimatePresence>
                  </Reorder.Group>
                </div>
              )}

              {visible.length > 0 && !editing && (
                <p className="px-1 text-center text-xs text-muted-foreground/80">
                  Desliza una categoría hacia la izquierda para editarla o archivarla.
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      <ArchivedSection
        open={showArchived}
        onToggle={() => setShowArchived((v) => !v)}
        archived={archivedCategories}
        onRestore={handleRestore}
        onDelete={setDeletingCat}
      />

      <CategorySheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        category={editingCat}
        defaultType={tab}
        existingNames={existingNames}
        onArchive={handleArchive}
      />

      <DeleteCategoryFlow
        deletingCat={deletingCat}
        txCount={txCount}
        activeCategories={categories ?? []}
        onClose={() => setDeletingCat(null)}
        onRemove={handleRemove}
        onMigrate={handleMigrateAndDelete}
      />
    </PageContainer>
  );
}
