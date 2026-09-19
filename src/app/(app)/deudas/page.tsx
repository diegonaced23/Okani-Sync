"use client";

import { use, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronRight, HandCoins, Plus, Scale } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PageContainer } from "@/components/layout/PageContainer";
import { Skeleton } from "@/components/ui/skeleton";
import { ObligationRow } from "@/components/debts/ObligationRow";
import { OverviewCard } from "@/components/debts/OverviewCard";
import { PaymentSheet } from "@/components/debts/PaymentSheet";
import { DebtSheet } from "@/components/debts/DebtSheet";
import { LoanSheet } from "@/components/debts/LoanSheet";
import { detailHref, fromDebt, fromLoan, type Obligation, type Side } from "@/components/debts/shared";
import { EASE_OUT_EXPO, GLASS_SURFACE, SPRING, haptic } from "@/lib/ios";
import { cn } from "@/lib/utils";

const TABS: { key: Side; label: string }[] = [
  { key: "debo", label: "Debo" },
  { key: "meDeben", label: "Me deben" },
];

export default function DeudasPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const params = use(searchParams);
  const router = useRouter();
  const reduce = useReducedMotion();

  const debts = useQuery(api.debts.list, {});
  const loans = useQuery(api.loans.list, {});
  const overview = useQuery(api.debts.overview);
  const setDebtArchived = useMutation(api.debts.setArchived);
  const setLoanArchived = useMutation(api.loans.setArchived);

  const [side, setSide] = useState<Side>(params.tab === "prestamos" ? "meDeben" : "debo");
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [paying, setPaying] = useState<Obligation | null>(null);
  const [showSettled, setShowSettled] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const debo = side === "debo";
  const items = useMemo(
    () => (debo ? (debts ?? []).map(fromDebt) : (loans ?? []).map(fromLoan)),
    [debo, debts, loans]
  );

  const groups = useMemo(() => {
    const byDue = (a: Obligation, b: Obligation) =>
      (a.dueDate ?? Number.MAX_SAFE_INTEGER) - (b.dueDate ?? Number.MAX_SAFE_INTEGER) || b.currentBalance - a.currentBalance;
    const live = items.filter((o) => !o.archived);
    return {
      overdue: live.filter((o) => o.status === "vencida").sort(byDue),
      active: live.filter((o) => o.status === "activa").sort(byDue),
      settled: live.filter((o) => o.status === "pagada"),
      archived: items.filter((o) => o.archived),
    };
  }, [items]);

  const counts = {
    debo: (debts ?? []).filter((d) => !d.archived && d.status !== "pagada").length,
    meDeben: (loans ?? []).filter((l) => !l.archived && l.status !== "pagada").length,
  };

  function switchSide(next: Side) {
    if (next === side) return;
    haptic();
    setSide(next);
    setOpenRowId(null);
    setShowSettled(false);
    setShowArchived(false);
    // En la URL, para que volver desde un detalle regrese a la misma pestaña
    router.replace(next === "meDeben" ? "/deudas?tab=prestamos" : "/deudas", { scroll: false });
  }

  async function toggleArchive(o: Obligation) {
    const archived = !o.archived;
    haptic(15);
    const run = (value: boolean) =>
      o.kind === "debt"
        ? setDebtArchived({ debtId: o.id as Id<"debts">, archived: value })
        : setLoanArchived({ loanId: o.id as Id<"loans">, archived: value });
    try {
      await run(archived);
      toast(`«${o.name}» ${archived ? "archivado" : "restaurado"}`, {
        action: {
          label: "Deshacer",
          onClick: () => { run(!archived).catch(() => toast.error("No se pudo deshacer")); },
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo archivar");
    }
  }

  const isLoading = debo ? debts === undefined : loans === undefined;
  const liveCount = groups.overdue.length + groups.active.length + groups.settled.length;
  let rowIndex = 0;

  function renderRows(list: Obligation[]) {
    return (
      <div className={cn("rounded-[24px] p-1.5", GLASS_SURFACE)}>
        <ul className="space-y-0.5">
          <AnimatePresence initial={false}>
            {list.map((o) => (
              <ObligationRow
                key={o.id}
                o={o}
                index={rowIndex++}
                openId={openRowId}
                setOpenId={setOpenRowId}
                onOpen={() => router.push(detailHref(o))}
                onPay={() => setPaying(o)}
                onToggleArchive={() => toggleArchive(o)}
              />
            ))}
          </AnimatePresence>
        </ul>
      </div>
    );
  }

  return (
    <PageContainer className="space-y-5">
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-foreground">Deudas y préstamos</h1>
          <p className="text-sm text-muted-foreground">
            {debo ? "Lo que debes y cómo vas pagándolo" : "Lo que prestaste y cuánto te han devuelto"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          aria-label={debo ? "Nueva deuda" : "Nuevo préstamo"}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-[0_8px_20px_-8px_rgb(16_185_129/0.9)] transition-transform active:scale-90"
        >
          <Plus className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
        </button>
      </header>

      {/* Pestañas con indicador que se desliza */}
      <div className="sticky top-[calc(64px+env(safe-area-inset-top))] z-30 lg:top-4">
        <div
          role="tablist"
          aria-label="Deudas o préstamos"
          className={cn("flex rounded-[18px] p-1", GLASS_SURFACE, "md:bg-[color-mix(in_oklch,var(--card)_85%,transparent)] md:backdrop-blur-xl")}
        >
          {TABS.map((t) => {
            const active = side === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`side-tab-${t.key}`}
                aria-selected={active}
                aria-controls="side-panel"
                onClick={() => switchSide(t.key)}
                className={cn(
                  "touch-hit relative flex flex-1 items-center justify-center gap-1.5 rounded-[14px] py-2 text-sm transition-colors",
                  active ? "font-bold text-foreground" : "font-semibold text-muted-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="side-tab-pill"
                    className="absolute inset-0 rounded-[14px] bg-[var(--surface)] shadow-[0_2px_10px_-4px_rgb(0_0_0/0.25)] dark:bg-white/10"
                    transition={SPRING}
                  />
                )}
                <span className="relative">{t.label}</span>
                <span className={cn(
                  "relative rounded-full px-1.5 text-[11px] font-bold tabular-nums",
                  active
                    ? t.key === "debo" ? "bg-[var(--os-magenta)]/15 text-[var(--os-magenta)]" : "bg-[var(--os-lime)]/20 text-lime-text"
                    : "bg-muted text-muted-foreground",
                )}>
                  {counts[t.key]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div id="side-panel" role="tabpanel" aria-labelledby={`side-tab-${side}`} className="relative">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={side}
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: debo ? -28 : 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: debo ? -28 : 28 }}
            transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
            className="space-y-5"
          >
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-[152px] rounded-[28px]" />
                <div className={cn("space-y-1.5 rounded-[24px] p-2", GLASS_SURFACE)}>
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-[18px]" />)}
                </div>
              </div>
            ) : liveCount === 0 && groups.archived.length === 0 ? (
              <EmptyState side={side} onCreate={() => setCreateOpen(true)} />
            ) : (
              <>
                <OverviewCard side={side} data={overview} />

                {groups.overdue.length > 0 && (
                  <Group title={debo ? "Vencidas" : "Vencidos"} danger>{renderRows(groups.overdue)}</Group>
                )}
                {groups.active.length > 0 && (
                  <Group title={debo ? "Por pagar" : "Por cobrar"}>{renderRows(groups.active)}</Group>
                )}
                {liveCount > 0 && groups.overdue.length + groups.active.length === 0 && (
                  <p className={cn("rounded-[24px] px-6 py-6 text-center text-sm font-semibold text-foreground", GLASS_SURFACE)}>
                    {debo ? "No tienes deudas pendientes 🎉" : "Nadie te debe dinero ahora mismo 🎉"}
                  </p>
                )}
                {groups.settled.length > 0 && (
                  <Collapsible
                    title={debo ? "Saldadas" : "Cobrados"}
                    count={groups.settled.length}
                    open={showSettled}
                    onToggle={() => setShowSettled((v) => !v)}
                  >
                    {renderRows(groups.settled)}
                  </Collapsible>
                )}
                {groups.archived.length > 0 && (
                  <Collapsible
                    title={debo ? "Archivadas" : "Archivados"}
                    count={groups.archived.length}
                    open={showArchived}
                    onToggle={() => setShowArchived((v) => !v)}
                  >
                    {renderRows(groups.archived)}
                  </Collapsible>
                )}

                <p className="px-1 text-center text-xs text-muted-foreground/80">
                  Desliza hacia la izquierda para {debo ? "abonar" : "registrar un cobro"} o archivar.
                </p>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {debo
        ? <DebtSheet open={createOpen} onOpenChange={setCreateOpen} debt={null} />
        : <LoanSheet open={createOpen} onOpenChange={setCreateOpen} loan={null} />}

      <PaymentSheet
        obligation={paying}
        open={paying !== null}
        onOpenChange={(open) => { if (!open) setPaying(null); }}
      />
    </PageContainer>
  );
}

function Group({ title, danger, children }: { title: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <section className="space-y-2" aria-label={title}>
      <h2 className={cn(
        "px-1 text-[11px] font-bold uppercase tracking-[0.08em]",
        danger ? "text-[var(--os-magenta)]" : "text-muted-foreground",
      )}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Collapsible({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
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
        {title}
        <span className="rounded-full bg-muted px-1.5 text-[11px] font-bold tabular-nums">{count}</span>
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
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function EmptyState({ side, onCreate }: { side: Side; onCreate: () => void }) {
  const reduce = useReducedMotion();
  const debo = side === "debo";
  const Icon = debo ? Scale : HandCoins;
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
      className={cn("relative overflow-hidden rounded-[28px] px-6 pb-7 pt-8 text-center", GLASS_SURFACE)}
    >
      <div className="relative mx-auto mb-6 h-32 w-32" aria-hidden="true">
        {[0.35, 0.65, 1].map((v, i) => (
          <motion.svg
            key={v}
            viewBox="0 0 100 100"
            className="absolute -rotate-90"
            style={{ inset: i * 11 }}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.1 }}
          >
            <circle cx="50" cy="50" r="44" fill="none" strokeWidth="8" stroke={debo ? "color-mix(in oklch, var(--os-magenta) 16%, transparent)" : "color-mix(in oklch, var(--os-lime) 20%, transparent)"} />
            <motion.circle
              cx="50" cy="50" r="44" fill="none" strokeWidth="8" strokeLinecap="round"
              stroke={["var(--os-orange)", "var(--os-cyan)", debo ? "var(--os-magenta)" : "var(--os-lime)"][i]}
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: v }}
              transition={{ duration: 1.1, delay: 0.2 + i * 0.15, ease: [0.22, 1, 0.36, 1] }}
            />
          </motion.svg>
        ))}
        <span className="absolute inset-[38px] flex items-center justify-center text-foreground">
          <Icon className="h-7 w-7" />
        </span>
      </div>
      <h2 className="text-lg font-extrabold tracking-tight text-foreground">
        {debo ? "Sin deudas registradas" : "No le has prestado a nadie"}
      </h2>
      <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground">
        {debo
          ? "Registra tus créditos o lo que le debes a alguien y mira cómo baja con cada abono."
          : "Cuando le prestes dinero a alguien, regístralo y lleva la cuenta de lo que te devuelve."}
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-gradient-to-r from-emerald-400 to-teal-500 text-[15px] font-bold text-white shadow-[0_10px_24px_-10px_rgb(16_185_129/0.8)] transition-transform active:scale-[0.98]"
      >
        <Plus className="h-4 w-4" aria-hidden="true" /> {debo ? "Registrar una deuda" : "Registrar un préstamo"}
      </button>
    </motion.div>
  );
}
