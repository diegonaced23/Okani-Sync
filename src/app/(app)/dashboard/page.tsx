"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { BalanceCard } from "@/components/dashboard/BalanceCard";
import { BalanceAccountsSheet } from "@/components/dashboard/BalanceAccountsSheet";
import { UpcomingCommitmentsCard } from "@/components/dashboard/UpcomingCommitmentsCard";
import { HealthScoreCard } from "@/components/dashboard/HealthScoreCard";
import { SavingsCard } from "@/components/dashboard/SavingsCard";
const NetWorthChart = dynamic(
  () => import("@/components/dashboard/NetWorthChart").then((m) => ({ default: m.NetWorthChart })),
  {
    ssr: false,
    // Skeleton estructurado para evitar CLS: imita el header + gráfico del componente real
    loading: () => (
      <div className="rounded-xl bg-card border border-border p-4">
        <div className="flex justify-between items-center mb-3">
          <Skeleton className="h-3 w-52" />
          <Skeleton className="h-4 w-14 rounded-full" />
        </div>
        <Skeleton className="h-[200px] w-full rounded-lg" />
      </div>
    ),
  }
);
import { AccountCard } from "@/components/accounts/AccountCard";
import { TransactionItem } from "@/components/transactions/TransactionItem";
import { Skeleton } from "@/components/ui/skeleton";

const SpendingChart = dynamic(
  () => import("@/components/dashboard/SpendingChart").then((m) => ({ default: m.SpendingChart })),
  { ssr: false, loading: () => <Skeleton className="h-56 rounded-xl" /> }
);
const MonthlyChart = dynamic(
  () => import("@/components/dashboard/MonthlyChart").then((m) => ({ default: m.MonthlyChart })),
  { ssr: false, loading: () => <Skeleton className="h-56 rounded-xl" /> }
);
const SpendingBySourceChart = dynamic(
  () => import("@/components/dashboard/SpendingBySourceChart").then((m) => ({ default: m.SpendingBySourceChart })),
  // h-48 coincide con el skeleton interno del componente (evita CLS en la carga del bundle)
  { ssr: false, loading: () => <Skeleton className="h-48 rounded-xl" /> }
);
import { currentMonth } from "@/lib/money";
import { MonthlySnapshotSection } from "@/components/dashboard/MonthlySnapshotSection";
import { BudgetsMiniList } from "@/components/dashboard/BudgetsMiniList";
import { lastNMonths } from "@/lib/utils";
import Link from "next/link";
import {
  ArrowDownLeft, ArrowUpRight, ArrowLeftRight, CreditCard, Plus,
} from "lucide-react";
import { useNewTransactionModal, type TxTab } from "@/contexts/new-transaction-modal";

type QuickAction =
  | { label: string; icon: React.ElementType; iconClassName: string; tab: TxTab }
  | { label: string; icon: React.ElementType; iconClassName: string; href: string };

// iconClassName debe ser un literal completo (no interpolado) para que Tailwind lo detecte.
const QUICK_ACTIONS: QuickAction[] = [
  {
    label: "Ingreso",
    icon: ArrowDownLeft,
    tab: "ingreso",
    iconClassName: "bg-[linear-gradient(135deg,var(--os-lime),var(--os-lime-2))] text-primary-foreground",
  },
  {
    label: "Gasto",
    icon: ArrowUpRight,
    tab: "gasto",
    iconClassName: "bg-[linear-gradient(135deg,var(--os-magenta),var(--os-magenta-2))] text-white",
  },
  {
    label: "Transferir",
    icon: ArrowLeftRight,
    tab: "transferencia",
    iconClassName: "bg-[linear-gradient(135deg,var(--os-cyan),var(--os-cyan-2))] text-[oklch(0.18_0.02_260)]",
  },
  {
    label: "Tarjeta",
    icon: CreditCard,
    href: "/tarjetas",
    iconClassName: "bg-[linear-gradient(135deg,var(--os-orange),var(--os-orange-2))] text-[oklch(0.18_0.02_260)]",
  },
];

export default function DashboardPage() {
  const { user } = useUser();
  const router = useRouter();
  const { openModal } = useNewTransactionModal();
  const [balanceSheetOpen, setBalanceSheetOpen] = useState(false);
  const openBalanceSheet = useCallback(() => setBalanceSheetOpen(true), []);
  const today = currentMonth();
  const last6 = lastNMonths(6);

  const me             = useQuery(api.users.getMe);
  const nw             = useQuery(api.accounts.netWorth);
  const health         = useQuery(api.accounts.financialHealthMetrics);
  const nwHistory      = useQuery(api.netWorthSnapshots.listByUser);
  const upcoming       = useQuery(api.transactions.upcomingCommitments, { days: 30 });
  const accounts       = useQuery(api.accounts.list);
  const sharedAccounts = useQuery(api.accounts.listSharedWithMe);
  const spending         = useQuery(api.transactions.spendingByCategory, { month: today });
  const spendingBySource = useQuery(api.transactions.spendingBySource, { month: today });
  const trend      = useQuery(api.transactions.monthlySummary, { months: last6 });
  const recent     = useQuery(api.transactions.listRecent, { limit: 5 });
  const categories = useQuery(api.categories.list, {});
  const budgets    = useQuery(api.budgets.listByMonthWithCategory, { month: today });
  const savings    = useQuery(api.accounts.monthlySavingsSummary, { month: today });

  const catMap = useMemo(
    () => Object.fromEntries((categories ?? []).map((c) => [c._id, c.name])),
    [categories]
  );

  const currency       = me?.currency ?? "COP";
  const currentTrend = useMemo(
    () => (trend ?? []).find((t) => t.month === today),
    [trend, today]
  );
  const monthIngresos  = currentTrend?.ingresos ?? 0;
  const monthGastos    = currentTrend?.gastos   ?? 0;
  const spentPct       = monthIngresos > 0 ? Math.round((monthGastos / monthIngresos) * 100) : 0;

  const monthName = new Date().toLocaleDateString("es-CO", { month: "long" })
    .replace(/^\w/, (c) => c.toUpperCase());

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Buenos días";
    if (h < 18) return "Buenas tardes";
    return "Buenas noches";
  })();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-2xl md:max-w-none mx-auto animate-stagger">

      {/* ── Saludo ── full width */}
      <div className="md:col-span-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {greeting}, {user?.firstName ?? "usuario"} 👋
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

      {/* ── Quick actions ── mobile only */}
      <div className="md:hidden grid grid-cols-4 gap-2.5">
        {QUICK_ACTIONS.map((action) => {
          const { label, icon: Icon, iconClassName } = action;
          const sharedClass = "flex flex-col items-center gap-1.5 py-3.5 px-1 rounded-xl border border-border bg-card transition-all active:scale-95 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
          const inner = (
            <>
              <span className={`flex items-center justify-center w-10 h-10 rounded-sm ${iconClassName}`}>
                <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
              </span>
              <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
            </>
          );

          if ("tab" in action) {
            return (
              <button
                key={label}
                type="button"
                onClick={() => openModal(action.tab)}
                className={sharedClass}
              >
                {inner}
              </button>
            );
          }

          return (
            <Link key={label} href={action.href} className={sharedClass}>
              {inner}
            </Link>
          );
        })}
      </div>

      {/* ── Mes en curso ── col 2 on desktop / inline on mobile */}
      <MonthlySnapshotSection
        loading={trend === undefined}
        monthIngresos={monthIngresos}
        monthGastos={monthGastos}
        spentPct={spentPct}
        monthName={monthName}
        currency={currency}
      />

      {/* ── Próximos 30 días ── full width (arriba para que el usuario vea compromisos urgentes de inmediato) */}
      <div className="md:col-span-2">
        <UpcomingCommitmentsCard data={upcoming} loading={upcoming === undefined} />
      </div>

      {/* ── Mis cuentas ── full width; visible en todos los tamaños de pantalla */}
      <section className="md:col-span-2">
        <div className="flex items-baseline justify-between mb-2.5">
          <h2 className="text-sm font-bold text-foreground">Mis cuentas</h2>
          <Link href="/cuentas" className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors py-2 -my-2 px-1">
            Ver todas
          </Link>
        </div>
        {accounts === undefined ? (
          <div className="flex gap-3 overflow-x-auto w-full accounts-carousel [scrollbar-width:none]">
            <Skeleton className="flex-none w-[220px] h-[130px] rounded-2xl" />
            <Skeleton className="flex-none w-[220px] h-[130px] rounded-2xl" />
          </div>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No tienes cuentas aún.</p>
        ) : (
          <ul
            role="list"
            className="flex gap-3 overflow-x-auto pb-1 w-full min-w-0 list-none p-0 m-0 accounts-carousel snap-x snap-mandatory [scrollbar-width:none] [-webkit-overflow-scrolling:touch]"
          >
            {accounts.map((account) => (
              <li key={account._id} className="flex-none w-[220px] snap-start list-none">
                <AccountCard account={account} onClick={() => router.push(`/cuentas/${account._id}`)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Evolución del patrimonio ── full width */}
      <div className="md:col-span-2">
        <NetWorthChart data={nwHistory} currency={currency} />
      </div>

      {/* ── Análisis de gastos ── 3 gráficos agrupados bajo una región semántica */}
      <section aria-label="Análisis de gastos" className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* ── Gastos por categoría ── col 1 */}
        <div>
          <SpendingChart data={spending} currency={currency} monthName={monthName} />
        </div>

        {/* ── Tendencia 6 meses ── col 2 */}
        <div>
          <MonthlyChart data={trend} currency={currency} />
        </div>

        {/* ── Gastos por fuente ── full width */}
        <div className="md:col-span-2">
          <SpendingBySourceChart data={spendingBySource} currency={currency} monthName={monthName} />
        </div>
      </section>

      {/* ── Salud financiera ── full width (antes de Ahorro para que el contexto de salud preceda al desglose) */}
      <div className="md:col-span-2">
        <HealthScoreCard data={health} loading={health === undefined} />
      </div>

      {/* ── Ahorro del mes ── full width */}
      <div className="md:col-span-2">
        {savings === undefined ? (
          <SavingsCard loading />
        ) : (
          <SavingsCard {...savings} />
        )}
      </div>

      {/* ── Últimos movimientos ── col 1 */}
      <section className="space-y-2.5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-bold text-foreground">Últimos movimientos</h2>
          <Link href="/transacciones" className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors py-2 -my-2 px-1">
            Ver todos
          </Link>
        </div>
        <div className="rounded-xl bg-card border border-border overflow-hidden">
          {recent === undefined ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : recent.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <p className="text-sm text-muted-foreground text-center">
                Registra tu primera transacción.
              </p>
              <button
                type="button"
                onClick={() => openModal("gasto")}
                className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-foreground border border-border bg-card hover:bg-muted/60 transition-colors"
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
                Registrar movimiento
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((tx) => (
                <li key={tx._id}>
                  <TransactionItem
                    transaction={tx}
                    categoryName={tx.categoryId ? catMap[tx.categoryId] : undefined}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── Presupuestos ── col 2 */}
      <BudgetsMiniList budgets={budgets} />

    </div>
  );
}
