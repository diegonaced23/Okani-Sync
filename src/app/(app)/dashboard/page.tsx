"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { BalanceCard } from "@/components/dashboard/BalanceCard";
import { BalanceAccountsSheet } from "@/components/dashboard/BalanceAccountsSheet";
import { SpendingChart } from "@/components/dashboard/SpendingChart";
import { MonthlyChart } from "@/components/dashboard/MonthlyChart";
import { SpendingBySourceChart } from "@/components/dashboard/SpendingBySourceChart";
import { AccountCard } from "@/components/accounts/AccountCard";
import { TransactionItem } from "@/components/transactions/TransactionItem";
import { Skeleton } from "@/components/ui/skeleton";
import { currentMonth, formatCents } from "@/lib/money";
import { lastNMonths, cn } from "@/lib/utils";
import Link from "next/link";
import {
  ArrowDownLeft, ArrowUpRight, ArrowLeftRight, CreditCard, Plus,
} from "lucide-react";
import { useNewTransactionModal, type TxTab } from "@/contexts/new-transaction-modal";

type QuickAction =
  | { label: string; icon: React.ElementType; gradient: string; textColor: string; tab: TxTab }
  | { label: string; icon: React.ElementType; gradient: string; textColor: string; href: string };

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: "Ingreso",
    icon: ArrowDownLeft,
    tab: "ingreso",
    gradient: "linear-gradient(135deg, var(--os-lime), var(--os-lime-2))",
    textColor: "var(--primary-foreground)",
  },
  {
    label: "Gasto",
    icon: ArrowUpRight,
    tab: "gasto",
    gradient: "linear-gradient(135deg, var(--os-magenta), var(--os-magenta-2))",
    textColor: "white",
  },
  {
    label: "Transferir",
    icon: ArrowLeftRight,
    tab: "transferencia",
    gradient: "linear-gradient(135deg, var(--os-cyan), var(--os-cyan-2))",
    textColor: "oklch(0.18 0.02 260)",
  },
  {
    label: "Tarjeta",
    icon: CreditCard,
    href: "/tarjetas",
    gradient: "linear-gradient(135deg, var(--os-orange), var(--os-orange-2))",
    textColor: "oklch(0.18 0.02 260)",
  },
];

export default function DashboardPage() {
  const { user } = useUser();
  const router = useRouter();
  const { openModal } = useNewTransactionModal();
  const [balanceSheetOpen, setBalanceSheetOpen] = useState(false);
  const today = currentMonth();
  const last6 = lastNMonths(6);

  const me             = useQuery(api.users.getMe);
  const balance        = useQuery(api.accounts.consolidatedBalance);
  const accounts       = useQuery(api.accounts.list);
  const sharedAccounts = useQuery(api.accounts.listSharedWithMe);
  const spending         = useQuery(api.transactions.spendingByCategory, { month: today });
  const spendingBySource = useQuery(api.transactions.spendingBySource, { month: today });
  const trend      = useQuery(api.transactions.monthlySummary, { months: last6 });
  const recent     = useQuery(api.transactions.listRecent, { limit: 5 });
  const categories = useQuery(api.categories.list, {});
  const budgets    = useQuery(api.budgets.listByMonthWithCategory, { month: today });

  const catMap = Object.fromEntries(
    (categories ?? []).map((c) => [c._id, c.name])
  );

  const currency       = me?.currency ?? "COP";
  const monthIngresos  = (trend ?? []).find((t) => t.month === today)?.ingresos ?? 0;
  const monthGastos    = (trend ?? []).find((t) => t.month === today)?.gastos   ?? 0;
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
          className="hidden md:inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white shrink-0 transition-opacity hover:opacity-90 active:scale-95"
          style={{ background: "linear-gradient(135deg, var(--os-lime), var(--os-cyan))", boxShadow: "0 4px 14px -2px color-mix(in oklch, var(--os-lime) 45%, transparent)" }}
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Nuevo movimiento
        </button>
      </div>

      {/* ── Balance hero ── col 1 */}
      <div>
        <BalanceCard
          total={balance?.total}
          currency={currency}
          missingRates={balance?.missingRates}
          accountCount={balance?.accountCount}
          loading={balance === undefined}
          onManageAccounts={() => setBalanceSheetOpen(true)}
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
          const { label, icon: Icon, gradient, textColor } = action;
          const sharedClass = "flex flex-col items-center gap-1.5 py-3.5 px-1 rounded-xl border border-border bg-card transition-all active:scale-95 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
          const inner = (
            <>
              <span
                className="flex items-center justify-center"
                style={{ width: 40, height: 40, borderRadius: 12, background: gradient, color: textColor }}
              >
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
      <section>
        {/* Desktop: tarjeta combinada con barra de progreso */}
        <div className="hidden md:flex flex-col rounded-xl border border-border bg-card p-5 h-full gap-4">
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)" }}>
            Mes en curso
          </p>
          {trend === undefined ? (
            <div className="space-y-3 flex-1">
              <Skeleton className="h-10 w-40" />
              <Skeleton className="h-10 w-40" />
              <Skeleton className="h-3 w-full rounded-full" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span style={{ width: 8, height: 8, borderRadius: 9999, background: "var(--os-lime)", flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: "var(--muted-foreground)", fontWeight: 600 }}>Ingresos</span>
                  </div>
                  <p className="font-mono-num" style={{ fontSize: 22, fontWeight: 800, color: "var(--os-lime)", letterSpacing: "-0.025em" }}>
                    {formatCents(monthIngresos, currency)}
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span style={{ width: 8, height: 8, borderRadius: 9999, background: "var(--os-magenta)", flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: "var(--muted-foreground)", fontWeight: 600 }}>Gastos</span>
                  </div>
                  <p className="font-mono-num" style={{ fontSize: 22, fontWeight: 800, color: "var(--os-magenta)", letterSpacing: "-0.025em" }}>
                    {formatCents(monthGastos, currency)}
                  </p>
                </div>
              </div>

              <div className="mt-auto space-y-1.5">
                <div
                  role="progressbar"
                  aria-valuenow={Math.min(100, spentPct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Has gastado el ${spentPct}% de tus ingresos este mes`}
                  className="h-2 w-full rounded-full overflow-hidden"
                  style={{ background: "var(--muted)" }}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, spentPct)}%`,
                      background: spentPct >= 100 ? "var(--danger)" : spentPct >= 80 ? "var(--warning, #f59e0b)" : "var(--os-lime)",
                    }}
                  />
                </div>
                <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                  Has gastado <strong>{spentPct}%</strong> de tus ingresos
                </p>
              </div>
            </>
          )}
        </div>

        {/* Mobile: dos tarjetas lado a lado (diseño original) */}
        <div className="md:hidden space-y-2.5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-bold text-foreground">Mes en curso · {monthName}</h2>
            <Link href="/transacciones" className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
              Detalles
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {trend === undefined ? (
              <>
                <Skeleton className="h-[72px] rounded-xl" />
                <Skeleton className="h-[72px] rounded-xl" />
              </>
            ) : (
              <>
                <div className="rounded-xl p-4" style={{ background: "color-mix(in oklch, var(--os-lime) 12%, var(--card))", border: "1px solid color-mix(in oklch, var(--os-lime) 28%, var(--border))" }}>
                  <div className="flex items-center gap-2 mb-1.5" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted-foreground)" }}>
                    <span style={{ width: 8, height: 8, borderRadius: 9999, background: "var(--os-lime)", boxShadow: "0 0 0 3px color-mix(in oklch, var(--os-lime) 28%, transparent)", flexShrink: 0 }} />
                    Ingresos
                  </div>
                  <p className="font-mono-num" style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.025em", color: "var(--os-lime)" }}>
                    {formatCents(monthIngresos, currency)}
                  </p>
                </div>
                <div className="rounded-xl p-4" style={{ background: "color-mix(in oklch, var(--os-magenta) 12%, var(--card))", border: "1px solid color-mix(in oklch, var(--os-magenta) 28%, var(--border))" }}>
                  <div className="flex items-center gap-2 mb-1.5" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted-foreground)" }}>
                    <span style={{ width: 8, height: 8, borderRadius: 9999, background: "var(--os-magenta)", boxShadow: "0 0 0 3px color-mix(in oklch, var(--os-magenta) 25%, transparent)", flexShrink: 0 }} />
                    Gastos
                  </div>
                  <p className="font-mono-num" style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.025em", color: "var(--os-magenta)" }}>
                    {formatCents(monthGastos, currency)}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── Mis cuentas ── mobile only */}
      <section className="md:hidden">
        <div className="flex items-baseline justify-between mb-2.5">
          <h2 className="text-sm font-bold text-foreground">Mis cuentas</h2>
          <Link href="/cuentas" className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
            Ver todas
          </Link>
        </div>
        {accounts === undefined ? (
          <div className="flex gap-3">
            <Skeleton className="flex-none w-[220px] h-[130px] rounded-2xl" />
            <Skeleton className="flex-none w-[220px] h-[130px] rounded-2xl" />
          </div>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No tienes cuentas aún.</p>
        ) : (
          <div
            className="flex gap-3 overflow-x-auto pb-1 w-full"
            style={{ scrollSnapType: "x mandatory", scrollbarWidth: "none", WebkitOverflowScrolling: "touch", minWidth: 0 }}
          >
            {accounts.map((account) => (
              <div key={account._id} style={{ flex: "0 0 220px", scrollSnapAlign: "start" }}>
                <AccountCard account={account} onClick={() => router.push(`/cuentas/${account._id}`)} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Gastos por categoría ── col 1 */}
      <div>
        <SpendingChart data={spending} currency={currency} />
      </div>

      {/* ── Tendencia 6 meses ── col 2 */}
      <div>
        <MonthlyChart data={trend} currency={currency} />
      </div>

      {/* ── Gastos por fuente ── full width */}
      <div className="md:col-span-2">
        <SpendingBySourceChart data={spendingBySource} currency={currency} />
      </div>

      {/* ── Últimos movimientos ── col 1 */}
      <section className="space-y-2.5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-bold text-foreground">Últimos movimientos</h2>
          <Link href="/transacciones" className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
            Ver todos
          </Link>
        </div>
        <div className="rounded-xl bg-card border border-border overflow-hidden">
          {recent === undefined ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : recent.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Registra tu primera transacción.
            </p>
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
      <section className="space-y-2.5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-bold text-foreground">Presupuestos</h2>
          <Link href="/presupuestos" className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
            Ver todos
          </Link>
        </div>
        <div className="rounded-xl bg-card border border-border overflow-hidden">
          {budgets === undefined ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
          ) : budgets.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Sin presupuestos este mes.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {budgets
                .sort((a, b) => (b.spent / b.amount) - (a.spent / a.amount))
                .slice(0, 5)
                .map((budget) => {
                  const pct = budget.amount > 0
                    ? Math.min(100, (budget.spent / budget.amount) * 100)
                    : 0;
                  const remaining = budget.amount - budget.spent;
                  const isOver = pct >= 100;
                  const isWarning = !isOver && pct >= (budget.alertThreshold ?? 80);
                  return (
                    <li key={budget._id} className="px-4 py-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {budget.categoryName ?? "Sin categoría"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {pct.toFixed(0)}% usado · {remaining < 0 ? "-" : ""}{formatCents(Math.abs(remaining), budget.currency)} restante
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={cn("text-sm font-bold", isOver ? "text-danger" : isWarning ? "text-warning" : "text-foreground")}>
                            {formatCents(budget.spent, budget.currency)}
                          </p>
                          <p className="text-xs text-muted-foreground">de {formatCents(budget.amount, budget.currency)}</p>
                        </div>
                      </div>
                      <div
                        role="progressbar"
                        aria-valuenow={Math.round(pct)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${budget.categoryName ?? "Presupuesto"}: ${Math.round(pct)}% gastado`}
                        className="h-1.5 w-full rounded-full overflow-hidden"
                        style={{ background: "var(--muted)" }}
                      >
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: isOver ? "var(--danger)" : isWarning ? "var(--warning, #f59e0b)" : (budget.categoryColor ?? "var(--accent)"),
                          }}
                        />
                      </div>
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      </section>

    </div>
  );
}
