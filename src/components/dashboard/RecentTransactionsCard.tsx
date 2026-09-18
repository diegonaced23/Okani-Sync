"use client";

import { memo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronRight, CreditCard, Plus } from "lucide-react";
import type { Doc } from "../../../convex/_generated/dataModel";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryIcon } from "@/components/ui/category-icon";
import { TX_TYPE_CONFIG } from "@/components/transactions/tx-type-config";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useBalanceHidden } from "@/hooks/use-balance-hidden";
import { useNewTransactionModal } from "@/contexts/new-transaction-modal";

type Category = Pick<Doc<"categories">, "_id" | "name" | "icon" | "color">;

interface RecentTransactionsCardProps {
  transactions: Doc<"transactions">[] | undefined;
  categories: Category[] | undefined;
  accountNames: Record<string, string>;
  cards: Pick<Doc<"cards">, "_id" | "name" | "lastFourDigits">[] | undefined;
}

const MASK = "$ ••••••";
const dayFmt = new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short" });

function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "Hoy", "Ayer" o "mar, 16 sept" */
function dayLabel(dayTs: number) {
  const today = startOfDay(Date.now());
  if (dayTs === today) return "Hoy";
  if (dayTs === today - 86_400_000) return "Ayer";
  const s = dayFmt.format(dayTs);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Últimos movimientos agrupados por día (estilo Apple Wallet). Los gastos van en
 * el color del texto y solo los ingresos en verde, para no saturar la lista de rojo.
 */
export const RecentTransactionsCard = memo(function RecentTransactionsCard({
  transactions,
  categories,
  accountNames,
  cards,
}: RecentTransactionsCardProps) {
  const [hidden] = useBalanceHidden();
  const reduce = useReducedMotion();
  const { openModal } = useNewTransactionModal();

  const catMap = new Map((categories ?? []).map((c) => [c._id as string, c]));
  const cardMap = new Map((cards ?? []).map((c) => [c._id as string, c]));

  // Movimientos que llegan después de la primera carga (Convex es reactivo) se
  // resaltan un instante; los de la carga inicial solo entran escalonados.
  // Estado derivado ajustado durante el render (patrón recomendado por React).
  const [seen, setSeen] = useState<Set<string> | null>(() =>
    transactions ? new Set(transactions.map((t) => t._id as string)) : null
  );
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  const [lastList, setLastList] = useState(transactions);
  if (transactions && transactions !== lastList) {
    setLastList(transactions);
    const ids = transactions.map((t) => t._id as string);
    if (seen === null) {
      setSeen(new Set(ids));
    } else {
      setFresh(new Set(ids.filter((id) => !seen.has(id))));
      setSeen(new Set([...seen, ...ids]));
    }
  }

  // Agrupar por día conservando el orden (ya vienen del más reciente al más antiguo)
  const groups: { day: number; items: Doc<"transactions">[] }[] = [];
  for (const tx of transactions ?? []) {
    const day = startOfDay(tx.date);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.items.push(tx);
    else groups.push({ day, items: [tx] });
  }

  let index = 0;

  return (
    <section className="md:col-span-2 space-y-2.5">
      <div className="flex items-baseline justify-between md:hidden">
        <h2 className="text-sm font-bold text-foreground">Últimos movimientos</h2>
        <SeeAll />
      </div>

      {/* Mobile: cristal (como "Mes en curso"); desktop: superficie con esquinas de 22px */}
      <div className={cn(
        "overflow-hidden rounded-[24px] border shadow-sm md:rounded-[22px]",
        "border-white/50 bg-[color-mix(in_oklch,var(--card)_72%,transparent)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10",
        "md:border-border md:bg-card md:backdrop-blur-none"
      )}>
        <div className="hidden md:flex items-center justify-between px-5 pt-5 pb-1">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground m-0">
            Últimos movimientos
          </h2>
          <SeeAll />
        </div>

        {transactions === undefined ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-11 rounded-xl" />)}
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <p className="text-sm text-muted-foreground">Registra tu primera transacción.</p>
            <button
              type="button"
              onClick={() => openModal("gasto")}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-[background-color,transform] hover:bg-muted/60 active:scale-95"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
              Registrar movimiento
            </button>
          </div>
        ) : (
          <div className="px-2 pb-2 pt-1 md:px-3">
            {groups.map((g) => (
              <div key={g.day}>
                <p className="px-2 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  {dayLabel(g.day)}
                </p>
                <ul className="space-y-0.5">
                  <AnimatePresence initial={!reduce}>
                    {g.items.map((tx) => {
                      const i = index++;
                      const isNew = fresh.has(tx._id);
                      return (
                        <motion.li
                          key={tx._id}
                          layout={!reduce}
                          initial={reduce ? false : { opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: isNew ? 0 : i * 0.04 }}
                        >
                          <Row
                            tx={tx}
                            category={tx.categoryId ? catMap.get(tx.categoryId) : undefined}
                            source={sourceLabel(tx, accountNames, cardMap)}
                            viaCard={!!tx.cardId}
                            hidden={hidden}
                            highlight={isNew && !reduce}
                          />
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
});

function SeeAll() {
  return (
    <Link
      href="/transacciones"
      className="touch-hit inline-flex items-center gap-0.5 rounded-full bg-muted/70 px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
    >
      Ver todos <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  );
}

function sourceLabel(
  tx: Doc<"transactions">,
  accountNames: Record<string, string>,
  cardMap: Map<string, { name: string; lastFourDigits: string }>,
) {
  if (tx.type === "transferencia") {
    const from = accountNames[tx.accountId ?? ""];
    const to = accountNames[tx.toAccountId ?? ""];
    return from && to ? `${from} → ${to}` : "Transferencia";
  }
  if (tx.cardId) {
    const card = cardMap.get(tx.cardId);
    return card ? `${card.name} ···${card.lastFourDigits}` : undefined;
  }
  return tx.accountId ? accountNames[tx.accountId] : undefined;
}

function Row({ tx, category, source, viaCard, hidden, highlight }: {
  tx: Doc<"transactions">;
  category?: Category;
  source?: string;
  viaCard: boolean;
  hidden: boolean;
  highlight: boolean;
}) {
  const config = TX_TYPE_CONFIG[tx.type] ?? TX_TYPE_CONFIG.gasto;
  const TypeIcon = config.icon;

  // Solo los ingresos llevan color; los gastos van en el color del texto
  let sign = config.sign;
  let isIncome = tx.type === "ingreso";
  if (tx.type === "transferencia" && tx.transferDirection) {
    isIncome = tx.transferDirection === "in";
    sign = isIncome ? "+" : "−";
  }

  const tint = category?.color ?? config.iconColor;
  const subtitle = [category?.name, source].filter(Boolean).join(" · ");

  return (
    <div className="relative flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/60">
      {highlight && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-xl"
          style={{ background: `color-mix(in oklch, ${tint} 22%, transparent)` }}
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.6, ease: "easeOut" }}
        />
      )}
      <span
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]"
        style={{ background: `color-mix(in oklch, ${tint} 16%, transparent)`, color: tint }}
      >
        {category
          ? <CategoryIcon name={category.icon} className="h-[17px] w-[17px]" aria-hidden="true" />
          : <TypeIcon className="h-[17px] w-[17px]" aria-hidden="true" />}
        {/* Pagado con tarjeta de crédito */}
        {viaCard && category && (
          <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-card text-muted-foreground ring-1 ring-border">
            <CreditCard className="h-2.5 w-2.5" aria-label="Con tarjeta de crédito" />
          </span>
        )}
      </span>

      <div className="relative min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight text-foreground">{tx.description}</p>
        {subtitle && <p className="truncate text-xs leading-tight text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>

      <p className={cn("relative shrink-0 font-mono-num text-sm font-bold tabular-nums",
        isIncome ? "text-lime-text" : "text-foreground")}>
        {hidden ? MASK : `${sign}${formatCents(tx.amount, tx.currency)}`}
      </p>
    </div>
  );
}
