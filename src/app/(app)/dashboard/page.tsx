"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import dynamic from "next/dynamic";
import { BalanceCard } from "@/components/dashboard/BalanceCard";
import { BalanceAccountsSheet } from "@/components/dashboard/BalanceAccountsSheet";
import { SavingsCard } from "@/components/dashboard/SavingsCard";
import { RecentTransactionsCard } from "@/components/dashboard/RecentTransactionsCard";
import { ProductsCarousel } from "@/components/dashboard/ProductsCarousel";
import { Skeleton } from "@/components/ui/skeleton";

const SpendingBreakdownCard = dynamic(
  () => import("@/components/dashboard/SpendingBreakdownCard").then((m) => ({ default: m.SpendingBreakdownCard })),
  // h-72 coincide con el skeleton interno del componente (evita CLS en la carga del bundle)
  { ssr: false, loading: () => <Skeleton className="h-72 rounded-xl" /> }
);
import { currentMonth } from "@/lib/money";
import { MonthlySnapshotSection } from "@/components/dashboard/MonthlySnapshotSection";
import { BudgetsMiniList } from "@/components/dashboard/BudgetsMiniList";
import { GoalsMiniList } from "@/components/dashboard/GoalsMiniList";
import { lastNMonths } from "@/lib/utils";
import { Plus } from "lucide-react";
import { useNewTransactionModal } from "@/contexts/new-transaction-modal";
import { PageContainer } from "@/components/layout/PageContainer";

export default function DashboardPage() {
  const { openModal } = useNewTransactionModal();
  const [balanceSheetOpen, setBalanceSheetOpen] = useState(false);
  const openBalanceSheet = useCallback(() => setBalanceSheetOpen(true), []);
  const today = currentMonth();
  const last6 = lastNMonths(6);

  const me             = useQuery(api.users.getMe);
  const nw             = useQuery(api.accounts.netWorth);
  // Solo para la comparativa de SavingsCard (tasa de ahorro del mes anterior)
  const health         = useQuery(api.accounts.financialHealthMetrics);
  const accounts       = useQuery(api.accounts.list);
  const sharedAccounts = useQuery(api.accounts.listSharedWithMe);
  const spending         = useQuery(api.transactions.spendingByCategory, { month: today });
  const spendingBySource = useQuery(api.transactions.spendingBySource, { month: today });
  const trend      = useQuery(api.transactions.monthlySummary, { months: last6 });
  const recent     = useQuery(api.transactions.listRecent, { limit: 5 });
  const categories = useQuery(api.categories.list, {});
  const budgets    = useQuery(api.budgets.listByMonthWithCategory, { month: today });
  const savings    = useQuery(api.accounts.monthlySavingsSummary, { month: today });
  const goals      = useQuery(api.goals.list);
  const cards      = useQuery(api.cards.list);
  const hasActiveGoals = (goals ?? []).some((g) => g.status === "activa");

  const accountNames = useMemo(
    () => Object.fromEntries((accounts ?? []).map((a) => [a._id, a.name])),
    [accounts]
  );

  const currency       = me?.currency ?? "COP";
  const currentTrend = useMemo(
    () => (trend ?? []).find((t) => t.month === today),
    [trend, today]
  );
  const monthIngresos  = currentTrend?.ingresos ?? 0;
  const monthGastos    = currentTrend?.gastos   ?? 0;

  // Base de comparación para los chips de variación mes a mes. `lastNMonths(6)`
  // viene en orden cronológico, así que el mes previo es el elemento anterior al
  // actual — no hace falta ninguna query adicional.
  //
  // El mes en curso está a medias: el día 17 lleva 17 días de movimientos frente
  // a los 30 completos del mes pasado. Comparar ambos en crudo daría una caída
  // falsa casi todos los días del mes, así que se prorratea el mes anterior a la
  // fracción de días transcurridos. Sigue siendo una aproximación — un ingreso
  // que cae en un día fijo de nómina distorsiona el chip de Ingresos hasta esa
  // fecha — pero no invierte el signo como sí hacía la comparación cruda.
  const prevProrated = useMemo(() => {
    const months = trend ?? [];
    const idx = months.findIndex((t) => t.month === today);
    if (idx <= 0) return undefined;
    const prev = months[idx - 1];

    const now = new Date();
    // Día 0 del mes siguiente = último día del mes actual
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const elapsed = now.getDate() / daysInMonth;

    return {
      ingresos: prev.ingresos * elapsed,
      gastos: prev.gastos * elapsed,
    };
  }, [trend, today]);

  const monthName = new Date().toLocaleDateString("es-CO", { month: "long" })
    .replace(/^\w/, (c) => c.toUpperCase());

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Buenos días";
    if (h < 18) return "Buenas tardes";
    return "Buenas noches";
  })();

  return (
    <PageContainer variant="wide" className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-stagger">

      {/* ── Saludo ── full width */}
      <div className="md:col-span-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {greeting}, {me?.name?.trim().split(" ")[0] || "usuario"} 👋
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString("es-CO", {
              weekday: "long", day: "numeric", month: "long",
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => openModal()}
          className="hidden md:inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white shrink-0 transition-opacity hover:opacity-90 active:scale-95 bg-[linear-gradient(135deg,var(--os-lime),var(--os-cyan))] shadow-[0_4px_14px_-2px_color-mix(in_oklch,var(--os-lime)_45%,transparent)]"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Nuevo movimiento
        </button>
      </div>

      {/* ── Balance hero ── col 1 */}
      <div>
        <BalanceCard
          total={nw?.netWorth ?? 0}
          currency={currency}
          missingRates={nw?.missingRates ?? []}
          accountCount={nw?.accountCount ?? 0}
          loading={nw === undefined}
          onManageAccounts={openBalanceSheet}
          totalAssets={nw?.totalAssets}
          totalCardDebt={nw?.totalCardDebt}
          totalDebt={nw?.totalDebt}
          totalLoansReceivable={nw?.totalLoansReceivable}
        />
        <BalanceAccountsSheet
          open={balanceSheetOpen}
          onOpenChange={setBalanceSheetOpen}
          accounts={accounts ?? []}
          sharedAccounts={sharedAccounts ?? []}
        />
      </div>

      {/* ── Mes en curso ── col 2 on desktop / inline on mobile */}
      <MonthlySnapshotSection
        loading={trend === undefined}
        monthIngresos={monthIngresos}
        monthGastos={monthGastos}
        monthName={monthName}
        currency={currency}
        prevIngresos={prevProrated?.ingresos}
        prevGastos={prevProrated?.gastos}
        history={trend}
      />

      {/* ── Últimos movimientos ── full width, justo debajo del mes en curso:
           es lo que más se consulta después del resumen del mes */}
      <RecentTransactionsCard
        transactions={recent}
        categories={categories}
        accountNames={accountNames}
        cards={cards}
      />

      {/* ── Mis productos ── cuentas (fichas) + tarjetas de crédito (plásticos) */}
      <ProductsCarousel accounts={accounts} cards={cards} />

      {/* ── Desglose del gasto (categoría / fuente) ── full width.
           "Por categoría" y "por fuente" son dos vistas del MISMO total del mes,
           así que comparten tarjeta con pestañas en vez de ocupar dos bloques. */}
      <section aria-label="Análisis de gastos" className="md:col-span-2">
        <SpendingBreakdownCard
          byCategory={spending}
          bySource={spendingBySource}
          currency={currency}
          monthName={monthName}
        />
      </section>

      {/* ── Ahorro del mes ── col 1 si hay metas al lado; si no, ancho completo */}
      <div className={hasActiveGoals ? undefined : "md:col-span-2"}>
        {savings === undefined ? (
          <SavingsCard loading />
        ) : (
          <SavingsCard {...savings} prevTasaAhorro={health?.savingsRate} />
        )}
      </div>

      {/* ── Metas de ahorro ── col 2, solo si hay metas activas */}
      {hasActiveGoals && <GoalsMiniList goals={goals} />}

      {/* ── Presupuestos ── full width (quedó solo en su fila) */}
      <div className="md:col-span-2">
        <BudgetsMiniList budgets={budgets} />
      </div>

    </PageContainer>
  );
}
