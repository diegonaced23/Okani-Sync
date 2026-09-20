"use client";

import { memo, useRef, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Plus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { computeMonthPace, type MonthPace } from "@/lib/monthPace";
import { GLASS_SURFACE } from "@/lib/ios";
import { useBalanceHidden } from "@/hooks/use-balance-hidden";
import { useNewTransactionModal } from "@/contexts/new-transaction-modal";
import { MoMDelta } from "./MoMDelta";
import { ActivityRings, AnimatedNumber, PACE_COLOR, PacePill, Sparkline } from "./month/primitives";

interface MonthlySnapshotSectionProps {
  /** true mientras la query de tendencia está cargando */
  loading: boolean;
  monthIngresos: number;
  monthGastos: number;
  /** Nombre capitalizado del mes actual (ej. "Junio") */
  monthName: string;
  currency: string;
  /** Ingresos del mes anterior prorrateados — undefined si no hay mes previo */
  prevIngresos: number | undefined;
  /** Gastos del mes anterior prorrateados — undefined si no hay mes previo */
  prevGastos: number | undefined;
  /** Tendencia de los últimos meses (orden cronológico, termina en el mes en curso) */
  history?: { month: string; ingresos: number; gastos: number }[];
}

const MASK = "$ ••••••";

function spentLabel(pace: MonthPace) {
  return pace.status === "sin-ingresos" ? "—" : `${Math.round(pace.spent * 100)}%`;
}

function ringsLabel(pace: MonthPace) {
  return pace.status === "sin-ingresos"
    ? `Hay gastos pero ningún ingreso este mes. Van ${pace.day} de ${pace.daysInMonth} días.`
    : `Gastaste el ${Math.round(pace.spent * 100)}% de tus ingresos; van ${pace.day} de ${pace.daysInMonth} días del mes.`;
}

/**
 * Sección "Mes en curso".
 * - Desktop: anillos tipo Apple Watch (gastado vs. avance del mes) + neto del mes.
 * - Mobile: tarjeta de cristal con páginas deslizables (neto · ingresos · gastos).
 * Los saldos se ocultan con el mismo ojo de la tarjeta de patrimonio.
 */
export const MonthlySnapshotSection = memo(function MonthlySnapshotSection({
  loading,
  monthIngresos,
  monthGastos,
  monthName,
  currency,
  prevIngresos,
  prevGastos,
  history = [],
}: MonthlySnapshotSectionProps) {
  const [hidden] = useBalanceHidden();
  const pace = computeMonthPace(monthIngresos, monthGastos);
  const fmt = (cents: number) => formatCents(cents, currency);
  const money = (cents: number, className?: string) =>
    hidden ? <span className={className}>{MASK}</span> : <AnimatedNumber value={cents} format={fmt} className={className} />;

  return (
    <section>
      <DesktopCard loading={loading} pace={pace} monthName={monthName} money={money}
        monthIngresos={monthIngresos} monthGastos={monthGastos}
        prevIngresos={prevIngresos} prevGastos={prevGastos} />
      <MobileCard loading={loading} pace={pace} monthName={monthName} money={money}
        monthIngresos={monthIngresos} monthGastos={monthGastos}
        prevIngresos={prevIngresos} prevGastos={prevGastos} history={history} />
    </section>
  );
});

interface VariantProps {
  loading: boolean;
  pace: MonthPace;
  monthName: string;
  money: (cents: number, className?: string) => React.ReactNode;
  monthIngresos: number;
  monthGastos: number;
  prevIngresos: number | undefined;
  prevGastos: number | undefined;
}

function EmptyMonth({ monthName, compact }: { monthName: string; compact?: boolean }) {
  const { openModal } = useNewTransactionModal();
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 text-center", compact ? "py-4" : "flex-1 py-2")}>
      <p className="text-sm text-muted-foreground">
        Aún no hay movimientos en {monthName.toLowerCase()}.
      </p>
      <button
        type="button"
        onClick={() => openModal("gasto")}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-[background-color,transform] hover:bg-muted/60 active:scale-95"
      >
        <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
        Registrar el primero
      </button>
    </div>
  );
}

// ─── Desktop · D1 ────────────────────────────────────────────────────────────

function DesktopCard({ loading, pace, monthName, money, monthIngresos, monthGastos, prevIngresos, prevGastos }: VariantProps) {
  const { ring } = PACE_COLOR[pace.status];
  const netNegative = pace.net < 0;

  return (
    <div className={cn("hidden h-full flex-col gap-4 rounded-[22px] p-5 md:flex", GLASS_SURFACE)}>
      <div className="flex items-center justify-between gap-2">
        {/* h2 para coherencia con los demás sections del dashboard */}
        <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground m-0">
          Mes en curso · {monthName}
        </h2>
        {!loading && pace.status !== "vacio" && <PacePill status={pace.status} />}
      </div>

      {loading ? (
        <div className="flex items-center gap-5 flex-1">
          <Skeleton className="h-[132px] w-[132px] rounded-full" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-8 w-44" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
          </div>
        </div>
      ) : pace.status === "vacio" ? (
        <EmptyMonth monthName={monthName} />
      ) : (
        <>
          <div className="flex items-center gap-5 os-enter">
            <ActivityRings spent={pace.spent} elapsed={pace.elapsed} spentColor={ring} label={ringsLabel(pace)}>
              <span className="font-mono-num text-[22px] font-extrabold leading-none tracking-tight text-foreground">
                {spentLabel(pace)}
              </span>
              <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">gastado</span>
            </ActivityRings>

            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground">
                  {netNegative ? "Te pasaste por" : "Te quedan"}
                </p>
                <p className={cn("font-mono-num text-[28px] font-extrabold leading-tight tracking-[-0.03em]",
                  netNegative ? "text-danger" : "text-foreground")}>
                  {money(Math.abs(pace.net))}
                </p>
              </div>
              <dl className="space-y-1.5 text-sm">
                <div className="flex items-center gap-2">
                  <dt className="flex items-center gap-1.5 text-muted-foreground w-20 shrink-0">
                    <span aria-hidden className="h-2 w-2 rounded-full bg-lime" /> Ingresos
                  </dt>
                  <dd className="font-mono-num font-bold text-lime-text truncate">{money(monthIngresos)}</dd>
                  <MoMDelta current={monthIngresos} previous={prevIngresos} polarity="up-good" srLabel="Ingresos" />
                </div>
                <div className="flex items-center gap-2">
                  <dt className="flex items-center gap-1.5 text-muted-foreground w-20 shrink-0">
                    <span aria-hidden className="h-2 w-2 rounded-full bg-magenta" /> Gastos
                  </dt>
                  <dd className="font-mono-num font-bold text-magenta truncate">{money(monthGastos)}</dd>
                  <MoMDelta current={monthGastos} previous={prevGastos} polarity="up-bad" srLabel="Gastos" />
                </div>
              </dl>
            </div>
          </div>

          {/* Leyenda de los anillos */}
          <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: ring }} />
              {pace.status === "sin-ingresos" ? "Gastos sin ingresos registrados" : <>Gastado: <strong className="text-foreground">{spentLabel(pace)}</strong> de tus ingresos</>}
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="h-2 w-2 rounded-full bg-[var(--os-cyan)]" />
              Mes: día <strong className="text-foreground">{pace.day}</strong> de {pace.daysInMonth}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Mobile · M1 ─────────────────────────────────────────────────────────────

const PAGES = ["Neto del mes", "Ingresos", "Gastos"] as const;

function MobileCard({ loading, pace, monthName, money, monthIngresos, monthGastos, prevIngresos, prevGastos, history }: VariantProps & { history: { ingresos: number; gastos: number }[] }) {
  const reduce = useReducedMotion();
  const scroller = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const { ring } = PACE_COLOR[pace.status];
  const netNegative = pace.net < 0;

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    const next = Math.round(el.scrollLeft / el.clientWidth);
    if (next !== page) setPage(next);
  }

  function goTo(i: number) {
    const el = scroller.current;
    el?.scrollTo({ left: i * el.clientWidth, behavior: reduce ? "auto" : "smooth" });
  }

  return (
    <div className="md:hidden space-y-2.5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-foreground">Mes en curso · {monthName}</h2>
        <Link href="/transacciones" className="touch-hit text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors py-2 -my-2 px-1">
          Detalles
        </Link>
      </div>

      {loading ? (
        <Skeleton className="h-[172px] rounded-[24px]" />
      ) : (
        // Cristal: superficie translúcida con desenfoque sobre la aurora del fondo
        <div
          className="os-enter relative overflow-hidden rounded-[24px] border border-white/50 shadow-lg transition-transform active:scale-[0.99] dark:border-white/10"
          style={{
            background: "color-mix(in oklch, var(--card) 70%, transparent)",
            backdropFilter: "blur(20px) saturate(1.6)",
            WebkitBackdropFilter: "blur(20px) saturate(1.6)",
          }}
        >
          {/* Resplandores de color bajo el cristal */}
          <span aria-hidden className="pointer-events-none absolute -left-10 -top-12 h-36 w-36 rounded-full opacity-40 blur-3xl" style={{ background: "var(--os-lime)" }} />
          <span aria-hidden className="pointer-events-none absolute -bottom-14 -right-8 h-36 w-36 rounded-full opacity-35 blur-3xl" style={{ background: "var(--os-cyan)" }} />

          {pace.status === "vacio" ? (
            <div className="relative p-5"><EmptyMonth monthName={monthName} compact /></div>
          ) : (
            <>
              <div
                ref={scroller}
                onScroll={onScroll}
                tabIndex={0}
                aria-label="Resumen del mes. Desliza para ver ingresos y gastos."
                className="relative flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-[24px]"
              >
                {/* Página 1 · Neto + ritmo */}
                <Page index={0}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-muted-foreground">
                      {netNegative ? "Te pasaste por" : "Te quedan"}
                    </p>
                    <PacePill status={pace.status} />
                  </div>
                  <p className={cn("mt-1 font-mono-num text-[32px] font-extrabold leading-none tracking-[-0.03em]",
                    netNegative ? "text-danger" : "text-foreground")}>
                    {money(Math.abs(pace.net))}
                  </p>
                  <PaceBar pace={pace} color={ring} />
                </Page>

                {/* Página 2 · Ingresos */}
                <Page index={1}>
                  <FlowPage label="Ingresos" dot="bg-lime" amount={money(monthIngresos, "text-lime-text")}
                    delta={<MoMDelta current={monthIngresos} previous={prevIngresos} polarity="up-good" srLabel="Ingresos" />}
                    trend={history.map((h) => h.ingresos)} color="var(--os-lime)" />
                </Page>

                {/* Página 3 · Gastos */}
                <Page index={2}>
                  <FlowPage label="Gastos" dot="bg-magenta" amount={money(monthGastos, "text-magenta")}
                    delta={<MoMDelta current={monthGastos} previous={prevGastos} polarity="up-bad" srLabel="Gastos" />}
                    trend={history.map((h) => h.gastos)} color="var(--os-magenta)" />
                </Page>
              </div>

              {/* Puntos de página estilo iOS */}
              <div className="relative flex justify-center pb-2">
                {PAGES.map((name, i) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => goTo(i)}
                    aria-label={`Ver ${name.toLowerCase()}`}
                    aria-current={page === i}
                    // 24×24 sin solaparse (touch-hit agrandaría cada punto sobre el vecino)
                    className="flex h-6 min-w-6 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <motion.span
                      className="block h-1.5 rounded-full bg-foreground"
                      animate={{ width: page === i ? 16 : 6, opacity: page === i ? 0.8 : 0.25 }}
                      transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 30 }}
                    />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Page({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <div
      role="group"
      aria-roledescription="página"
      aria-label={`${index + 1} de ${PAGES.length}: ${PAGES[index]}`}
      className="w-full flex-none snap-center px-5 pt-5 pb-3 min-h-[138px]"
    >
      {children}
    </div>
  );
}

/** Barra de gasto con la marca de "hoy": si el relleno la adelanta, se va rápido. */
function PaceBar({ pace, color }: { pace: MonthPace; color: string }) {
  const reduce = useReducedMotion();
  const fill = Math.min(1, pace.spent);
  return (
    <div className="mt-4">
      <div className="relative h-2.5 w-full rounded-full bg-[color-mix(in_oklch,var(--foreground)_8%,transparent)]">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${fill * 100}%` }}
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 60, damping: 18 }}
        />
        {/* Marca de hoy */}
        <span
          aria-hidden
          className="absolute -top-1 -bottom-1 w-[3px] -translate-x-1/2 rounded-full bg-[var(--os-cyan)] ring-2 ring-card"
          style={{ left: `${pace.elapsed * 100}%` }}
        />
      </div>
      <p className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>
          {pace.status === "sin-ingresos" ? "Sin ingresos registrados" : <>Gastado <strong className="text-foreground">{spentLabel(pace)}</strong></>}
        </span>
        <span>Hoy: día {pace.day} de {pace.daysInMonth}</span>
      </p>
    </div>
  );
}

function FlowPage({ label, dot, amount, delta, trend, color }: {
  label: string;
  dot: string;
  amount: React.ReactNode;
  delta: React.ReactNode;
  trend: number[];
  color: string;
}) {
  return (
    <>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <span aria-hidden className={cn("h-2 w-2 rounded-full", dot)} /> {label}
      </p>
      <div className="mt-1 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono-num text-[28px] font-extrabold leading-none tracking-[-0.03em]">{amount}</p>
          <div className="mt-2">{delta}</div>
        </div>
        <Sparkline values={trend} color={color} />
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {/* El último punto es el mes en curso, que aún no ha terminado: sin decirlo,
            la serie parece caer siempre al final. */}
        {trend.length - 1} meses cerrados + el mes en curso
      </p>
    </>
  );
}
