"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useUser } from "@clerk/nextjs";
import { BalanceCard } from "@/components/dashboard/BalanceCard";
import { SpendingChart } from "@/components/dashboard/SpendingChart";
import { MonthlyChart } from "@/components/dashboard/MonthlyChart";
import { TransactionItem } from "@/components/transactions/TransactionItem";
import { Skeleton } from "@/components/ui/skeleton";
import { currentMonth, formatCents } from "@/lib/money";
import { lastNMonths } from "@/lib/utils";

export default function DashboardPage() {
  const { user } = useUser();
  const today = currentMonth();
  const last6 = lastNMonths(6);

  const me = useQuery(api.users.getMe);
  const balance = useQuery(api.accounts.consolidatedBalance);
  const spending = useQuery(api.transactions.spendingByCategory, { month: today });
  const trend = useQuery(api.transactions.monthlySummary, { months: last6 });
  const recent = useQuery(api.transactions.listRecent, { limit: 5 });
  const categories = useQuery(api.categories.list, {});
  const activeDebts = useQuery(api.debts.list, { status: "activa" });

  const catMap = Object.fromEntries(
    (categories ?? []).map((c) => [c._id, c.name])
  );

  const currency = me?.currency ?? "COP";
  const totalDebt = (activeDebts ?? []).reduce((s, d) => s + d.currentBalance, 0);

  const monthIngresos = (trend ?? []).find((t) => t.month === today)?.ingresos ?? 0;
  const monthGastos   = (trend ?? []).find((t) => t.month === today)?.gastos   ?? 0;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Buenos días";
    if (h < 18) return "Buenas tardes";
    return "Buenas noches";
  })();

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      {/* Saludo */}
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

      {/* Balance total */}
      <BalanceCard
        total={balance?.total}
        currency={currency}
        missingRates={balance?.missingRates}
        accountCount={balance?.accountCount}
        loading={balance === undefined}
      />

      {/* Métricas rápidas del mes */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Ingresos",  value: monthIngresos, color: "text-accent" },
          { label: "Gastos",    value: monthGastos,   color: "text-danger" },
          { label: "Deudas",    value: totalDebt,     color: "text-warning" },
        ].map(({ label, value, color }) => (
          trend === undefined ? (
            <Skeleton key={label} className="h-16 rounded-xl" />
          ) : (
            <div key={label} className="rounded-xl bg-card border border-border p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
              <p className={`text-sm font-bold tabular-nums mt-0.5 ${color}`}>
                {formatCents(value, currency)}
              </p>
            </div>
          )
        ))}
      </div>

      {/* Gráfico de gastos por categoría */}
      <SpendingChart data={spending} currency={currency} />

      {/* Tendencia 6 meses */}
      <MonthlyChart data={trend} currency={currency} />

      {/* Últimas transacciones */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Últimos movimientos
        </h2>
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
    </div>
  );
}
