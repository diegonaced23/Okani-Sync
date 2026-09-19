"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CalendarClock, Plus, Repeat } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../../convex/_generated/api";
import { PageContainer } from "@/components/layout/PageContainer";
import { Skeleton } from "@/components/ui/skeleton";
import { RecurringRow } from "@/components/recurrentes/RecurringRow";
import { RecurringSheet } from "@/components/recurrentes/RecurringSheet";
import { SummaryCard } from "@/components/recurrentes/SummaryCard";
import {
  daysUntil,
  isEnded,
  kindOf,
  relativeLabel,
  type Recurring,
  type RecurringKind,
} from "@/components/recurrentes/shared";
import { EASE_OUT_EXPO, GLASS_SURFACE, SPRING, haptic } from "@/lib/ios";
import { cn } from "@/lib/utils";

type Filter = "todos" | RecurringKind;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "gasto", label: "Gastos" },
  { key: "ingreso", label: "Ingresos" },
];

/** Hasta cuántos días se agrupan como "próximos" */
const SOON_DAYS = 7;

export default function RecurrentesPage() {
  const reduce = useReducedMotion();
  const recurrentes = useQuery(api.recurringTransactions.list);
  const summary = useQuery(api.recurringTransactions.summary);
  const accounts = useQuery(api.accounts.list);
  const cards = useQuery(api.cards.list);
  const categories = useQuery(api.categories.list, {});
  const setPaused = useMutation(api.recurringTransactions.setPaused);
  const removeRec = useMutation(api.recurringTransactions.remove);
  const restoreRec = useMutation(api.recurringTransactions.restore);

  const [filter, setFilter] = useState<Filter>("todos");
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Recurring | null>(null);

  const catMap = useMemo(() => new Map((categories ?? []).map((c) => [c._id as string, c])), [categories]);
  const sourceNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of accounts ?? []) m.set(a._id, a.name);
    for (const c of cards ?? []) m.set(c._id, `${c.name} ····${c.lastFourDigits}`);
    return m;
  }, [accounts, cards]);

  const counts = useMemo(() => {
    const all = recurrentes ?? [];
    return {
      todos: all.length,
      gasto: all.filter((r) => kindOf(r) === "gasto").length,
      ingreso: all.filter((r) => kindOf(r) === "ingreso").length,
    };
  }, [recurrentes]);

  const groups = useMemo(() => {
    const list = [...(recurrentes ?? [])]
      .filter((r) => filter === "todos" || kindOf(r) === filter)
      .sort((a, b) => a.nextOccurrence - b.nextOccurrence);
    const soon: Recurring[] = [];
    const later: Recurring[] = [];
    const inactive: Recurring[] = [];
    for (const r of list) {
      if (r.paused || isEnded(r)) inactive.push(r);
      else if (daysUntil(r.nextOccurrence) <= SOON_DAYS) soon.push(r);
      else later.push(r);
    }
    return [
      { key: "soon", title: `Próximos ${SOON_DAYS} días`, items: soon },
      { key: "later", title: "Más adelante", items: later },
      { key: "inactive", title: "Pausados y finalizados", items: inactive },
    ].filter((g) => g.items.length > 0);
  }, [recurrentes, filter]);

  const nextUp = useMemo(() => {
    const next = [...(recurrentes ?? [])]
      .filter((r) => !r.paused && !isEnded(r))
      .sort((a, b) => a.nextOccurrence - b.nextOccurrence)[0];
    return next ? { description: next.description, when: relativeLabel(next.nextOccurrence) } : undefined;
  }, [recurrentes]);

  const pausedCount = (recurrentes ?? []).filter((r) => r.paused).length;

  // ── Acciones ──────────────────────────────────────────────────────────────

  function openCreate() {
    setOpenRowId(null);
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(rec: Recurring) {
    setEditing(rec);
    setSheetOpen(true);
  }

  async function togglePause(rec: Recurring) {
    const paused = !rec.paused;
    haptic(15);
    try {
      await setPaused({ recurringId: rec._id, paused });
      toast(paused ? `«${rec.description}» en pausa` : `«${rec.description}» reanudado`, {
        description: paused ? "No se registrará hasta que lo reanudes." : undefined,
        action: {
          label: "Deshacer",
          onClick: () => {
            setPaused({ recurringId: rec._id, paused: !paused }).catch(() => toast.error("No se pudo deshacer"));
          },
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar");
    }
  }

  async function handleDelete(rec: Recurring) {
    haptic(15);
    try {
      await removeRec({ recurringId: rec._id });
      toast(`«${rec.description}» eliminado`, {
        description: "Los movimientos ya registrados se conservan.",
        action: {
          label: "Deshacer",
          onClick: () => {
            restoreRec({ recurringId: rec._id }).catch(() => toast.error("No se pudo restaurar"));
          },
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo eliminar");
    }
  }

  const isLoading = recurrentes === undefined;
  const isEmpty = !isLoading && recurrentes.length === 0;
  let rowIndex = 0;

  return (
    <PageContainer className="space-y-5">
      {/* Título grande estilo iOS */}
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-foreground">Recurrentes</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? " "
              : `${recurrentes.length - pausedCount} activos${pausedCount ? ` · ${pausedCount} en pausa` : ""}`}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          aria-label="Nuevo recurrente"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-[0_8px_20px_-8px_rgb(16_185_129/0.9)] transition-transform active:scale-90"
        >
          <Plus className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
        </button>
      </header>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-[168px] rounded-[28px]" />
          <Skeleton className="h-11 rounded-[18px]" />
          <div className={cn("space-y-1.5 rounded-[24px] p-2", GLASS_SURFACE)}>
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 rounded-[16px]" />)}
          </div>
        </div>
      ) : isEmpty ? (
        <EmptyState onCreate={openCreate} />
      ) : (
        <>
          <SummaryCard summary={summary} nextUp={nextUp} />

          {/* Filtro con indicador que se desliza; fijo bajo el header al hacer scroll */}
          <div className="sticky top-[calc(64px+env(safe-area-inset-top))] z-30 lg:top-4">
            <div
              role="tablist"
              aria-label="Filtrar recurrentes"
              className={cn("flex rounded-[18px] p-1", GLASS_SURFACE, "md:bg-[color-mix(in_oklch,var(--card)_85%,transparent)] md:backdrop-blur-xl")}
            >
              {FILTERS.map((f) => {
                const active = filter === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-controls="rec-panel"
                    onClick={() => { if (!active) { haptic(); setFilter(f.key); setOpenRowId(null); } }}
                    className={cn(
                      "touch-hit relative flex flex-1 items-center justify-center gap-1.5 rounded-[14px] py-2 text-sm transition-colors",
                      active ? "font-bold text-foreground" : "font-semibold text-muted-foreground",
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="rec-filter-pill"
                        className="absolute inset-0 rounded-[14px] bg-[var(--surface)] shadow-[0_2px_10px_-4px_rgb(0_0_0/0.25)] dark:bg-white/10"
                        transition={SPRING}
                      />
                    )}
                    <span className="relative">{f.label}</span>
                    <span className={cn(
                      "relative rounded-full px-1.5 text-[11px] font-bold tabular-nums",
                      active ? "bg-muted text-foreground" : "bg-muted text-muted-foreground",
                    )}>
                      {counts[f.key]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div id="rec-panel" role="tabpanel" className="relative">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={filter}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                className="space-y-5"
              >
                {groups.length === 0 ? (
                  <div className={cn("rounded-[24px] px-6 py-10 text-center", GLASS_SURFACE)}>
                    <p className="text-sm font-semibold text-foreground">
                      {filter === "ingreso" ? "No tienes ingresos recurrentes" : "No tienes gastos recurrentes"}
                    </p>
                    <button
                      type="button"
                      onClick={openCreate}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-muted px-4 py-2 text-sm font-semibold text-foreground transition-[background-color,transform] hover:bg-muted/70 active:scale-95"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" /> Agregar
                    </button>
                  </div>
                ) : groups.map((g) => (
                  <section key={g.key} className="space-y-2" aria-label={g.title}>
                    <h2 className="px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                      {g.title}
                    </h2>
                    <div className={cn("rounded-[24px] p-1.5", GLASS_SURFACE)}>
                      <ul className="space-y-0.5">
                        <AnimatePresence initial={false}>
                          {g.items.map((rec) => (
                            <RecurringRow
                              key={rec._id}
                              rec={rec}
                              index={rowIndex++}
                              category={rec.categoryId ? catMap.get(rec.categoryId) : undefined}
                              sourceLabel={sourceNames.get(rec.accountId ?? rec.cardId ?? "")}
                              openId={openRowId}
                              setOpenId={setOpenRowId}
                              onEdit={() => openEdit(rec)}
                              onTogglePause={() => togglePause(rec)}
                              onDelete={() => handleDelete(rec)}
                            />
                          ))}
                        </AnimatePresence>
                      </ul>
                    </div>
                  </section>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>

          <p className="px-1 text-center text-xs text-muted-foreground/80">
            Desliza hacia la izquierda para pausar o eliminar.
          </p>
        </>
      )}

      <RecurringSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        recurring={editing}
        defaultKind={filter === "ingreso" ? "ingreso" : "gasto"}
        onTogglePause={togglePause}
        onDelete={handleDelete}
      />
    </PageContainer>
  );
}

/** Sin recurrentes: calendario con fichas flotando y el botón para programar el primero. */
function EmptyState({ onCreate }: { onCreate: () => void }) {
  const reduce = useReducedMotion();
  const chips = [
    { label: "Arriendo", day: "1", tone: "var(--os-violet)" },
    { label: "Netflix", day: "12", tone: "var(--os-magenta)" },
    { label: "Salario", day: "30", tone: "var(--os-lime)" },
  ];
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
      className={cn("relative overflow-hidden rounded-[28px] px-6 pb-7 pt-8 text-center", GLASS_SURFACE)}
    >
      <div className="relative mx-auto mb-6 h-36 w-52" aria-hidden="true">
        <span className="absolute inset-x-6 inset-y-3 flex items-center justify-center rounded-[26px] bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-[0_14px_34px_-12px_rgb(16_185_129/0.7)]">
          <CalendarClock className="h-10 w-10" />
        </span>
        {chips.map((c, i) => (
          <motion.span
            key={c.label}
            className="absolute flex items-center gap-1.5 rounded-full border border-white/50 bg-[color-mix(in_oklch,var(--card)_80%,transparent)] px-2.5 py-1 text-[11px] font-bold text-foreground shadow-md backdrop-blur-md dark:border-white/10"
            style={[{ left: -6, top: 4 }, { right: -10, top: 44 }, { left: 6, bottom: 0 }][i]}
            initial={reduce ? false : { opacity: 0, scale: 0.6 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: [0, -5, 0] }}
            transition={{
              opacity: { delay: 0.15 + i * 0.1 },
              scale: { delay: 0.15 + i * 0.1, type: "spring", stiffness: 500, damping: 20 },
              y: { duration: 3 + i * 0.5, repeat: Infinity, ease: "easeInOut", delay: i * 0.4 },
            }}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: c.tone }} />
            {c.label} · {c.day}
          </motion.span>
        ))}
      </div>

      <h2 className="text-lg font-extrabold tracking-tight text-foreground">Automatiza lo que se repite</h2>
      <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground">
        Arriendo, suscripciones o tu salario: prográmalos una vez y se registran solos en su fecha.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-gradient-to-r from-emerald-400 to-teal-500 text-[15px] font-bold text-white shadow-[0_10px_24px_-10px_rgb(16_185_129/0.8)] transition-transform active:scale-[0.98]"
      >
        <Repeat className="h-4 w-4" aria-hidden="true" /> Programar el primero
      </button>
    </motion.div>
  );
}
