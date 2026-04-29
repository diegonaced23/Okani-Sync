"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { BalanceCard } from "@/components/dashboard/BalanceCard";
import { SpendingChart } from "@/components/dashboard/SpendingChart";
import { MonthlyChart } from "@/components/dashboard/MonthlyChart";
import { AccountCard } from "@/components/accounts/AccountCard";
import { TransactionItem } from "@/components/transactions/TransactionItem";
import { Skeleton } from "@/components/ui/skeleton";
import { currentMonth, formatCents } from "@/lib/money";
import { lastNMonths } from "@/lib/utils";
import Link from "next/link";
import {
  ArrowDownLeft, ArrowUpRight, ArrowLeftRight, CreditCard,
} from "lucide-react";

const QUICK_ACTIONS = [
  {
    label: "Ingreso",
    icon: ArrowDownLeft,
    href: "/transacciones",
    gradient: "linear-gradient(135deg, var(--os-lime), var(--os-lime-2))",
    textColor: "var(--primary-foreground)",
  },
  {
    label: "Gasto",
    icon: ArrowUpRight,
    href: "/transacciones",
    gradient: "linear-gradient(135deg, var(--os-magenta), var(--os-magenta-2))",
    textColor: "white",
  },
  {
    label: "Transferir",
    icon: ArrowLeftRight,
    href: "/transacciones",
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
] as const;

export default function DashboardPage() {
  const { user } = useUser();
  const router = useRouter();
  const today = currentMonth();
  const last6 = lastNMonths(6);

  const me       = useQuery(api.users.getMe);
  const balance  = useQuery(api.accounts.consolidatedBalance);
  const accounts = useQuery(api.accounts.list);
  const spending = useQuery(api.transactions.spendingByCategory, { month: today });
  const trend    = useQuery(api.transactions.monthlySummary, { months: last6 });
  const recent   = useQuery(api.transactions.listRecent, { limit: 5 });
  const categories = useQuery(api.categories.list, {});

  const catMap = Object.fromEntries(
    (categories ?? []).map((c) => [c._id, c.name])
  );

  const currency = me?.currency ?? "COP";
  const monthIngresos = (trend ?? []).find((t) => t.month === today)?.ingresos ?? 0;
  const monthGastos   = (trend ?? []).find((t) => t.month === today)?.gastos   ?? 0;

  const monthName = new Date().toLocaleDateString("es-CO", { month: "long" })
    .replace(/^\w/, (c) => c.toUpperCase());

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Buenos días";
    if (h < 18) return "Buenas tardes";
    return "Buenas noches";
  })();

  return (
    <div className="space-y-5 max-w-2xl mx-auto animate-stagger">

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

      {/* Balance hero */}
      <BalanceCard
        total={balance?.total}
        currency={currency}
        missingRates={balance?.missingRates}
        accountCount={balance?.accountCount}
        loading={balance === undefined}
      />

      {/* Quick actions */}
      <div className="grid grid-cols-4 gap-2.5">
        {QUICK_ACTIONS.map(({ label, icon: Icon, href, gradient, textColor }) => (
          <Link
            key={label}
            href={href}
            className="flex flex-col items-center gap-1.5 py-3.5 px-1 rounded-xl border border-border bg-card transition-all active:scale-95 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              className="flex items-center justify-center"
              style={{ width: 40, height: 40, borderRadius: 12, background: gradient, color: textColor }}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
            </span>
            <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
          </Link>
        ))}
      </div>

      {/* Mes en curso */}
      <section>
        <div className="flex items-baseline justify-between mb-2.5">
          <h2 className="text-sm font-bold text-foreground">
            Mes en curso · {monthName}
          </h2>
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
              {/* Ingresos */}
              <div
                className="rounded-xl p-4"
                style={{
                  background: "color-mix(in oklch, var(--os-lime) 12%, var(--card))",
                  border: "1px solid color-mix(in oklch, var(--os-lime) 28%, var(--border))",
                }}
              >
                <div className="flex items-center gap-2 mb-1.5" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted-foreground)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 9999, background: "var(--os-lime)", boxShadow: "0 0 0 3px color-mix(in oklch, var(--os-lime) 28%, transparent)", flexShrink: 0 }} />
                  Ingresos
                </div>
                <p className="font-mono-num" style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.025em", color: "var(--os-lime)" }}>
                  {formatCents(monthIngresos, currency)}
                </p>
              </div>

              {/* Gastos */}
              <div
                className="rounded-xl p-4"
                style={{
                  background: "color-mix(in oklch, var(--os-magenta) 12%, var(--card))",
                  border: "1px solid color-mix(in oklch, var(--os-magenta) 28%, var(--border))",
                }}
              >
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
      </section>

      {/* Mis cuentas — carrusel horizontal */}
      <section>
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
          <p className="text-sm text-muted-foreground py-4 text-center">
            No tienes cuentas aún.
          </p>
        ) : (
          <div
            className="flex gap-3 overflow-x-auto pb-1 w-full"
            style={{ scrollSnapType: "x mandatory", scrollbarWidth: "none", WebkitOverflowScrolling: "touch", minWidth: 0 }}
          >
            {accounts.map((account) => (
              <div
                key={account._id}
                style={{ flex: "0 0 220px", scrollSnapAlign: "start" }}
              >
                <AccountCard
                  account={account}
                  onClick={() => router.push(`/cuentas/${account._id}`)}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Gastos por categoría */}
      <SpendingChart data={spending} currency={currency} />

      {/* Tendencia 6 meses */}
      <MonthlyChart data={trend} currency={currency} />

      {/* Últimas transacciones */}
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

    </div>
  );
}
