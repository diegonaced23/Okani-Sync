"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CreditCard, EyeOff, HandCoins, Loader2, Scale } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { AccountSummary } from "@/components/accounts/AccountCard";
import { AppSheet } from "@/components/ui/app-sheet";
import { sourceVisual } from "@/components/ui/source-chip";
import { Switch } from "@/components/ui/switch";
import { useBalanceHidden } from "@/hooks/use-balance-hidden";
import { EASE_OUT_EXPO, FIELD_LABEL, GLASS_SURFACE, haptic, tint } from "@/lib/ios";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

type SharedAccount = Pick<AccountSummary, "_id" | "name" | "balance" | "currency" | "color">;

interface NetWorthSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Doc<"accounts">[];
  sharedAccounts: (SharedAccount | null)[];
  cards: Doc<"cards">[];
  /** Deudas activas y vencidas: el mismo conjunto que resta el patrimonio */
  debts: Doc<"debts">[];
  /** Préstamos otorgados activos y vencidos: el mismo conjunto que suma */
  loans: Doc<"loans">[];
}

const MASK = "$ ••••••";

/**
 * Qué entra en el patrimonio neto. Antes solo se podían elegir las cuentas, aunque
 * el total también resta tarjetas y deudas y suma préstamos por cobrar: tres cuartas
 * partes de la cifra no se podían ajustar.
 *
 * Excluir algo aquí no lo esconde de su propio módulo: la deuda sigue apareciendo
 * completa en Deudas y el total de tarjetas sigue intacto en Productos. La marca dice
 * «esto no es parte de mi patrimonio», no «olvídate de esto».
 */
export function NetWorthSheet({
  open,
  onOpenChange,
  accounts,
  sharedAccounts,
  cards,
  debts,
  loans,
}: NetWorthSheetProps) {
  const toggleAccount = useMutation(api.accounts.toggleBalanceInclusion);
  const toggleCard = useMutation(api.cards.toggleBalanceInclusion);
  const toggleDebt = useMutation(api.debts.toggleBalanceInclusion);
  const toggleLoan = useMutation(api.loans.toggleBalanceInclusion);

  const [pending, setPending] = useState<string | null>(null);
  const [hidden] = useBalanceHidden();

  /** Envuelve cualquiera de los cuatro toggles con el mismo estado y manejo de error. */
  async function run(id: string, fn: () => Promise<unknown>) {
    setPending(id);
    haptic();
    try {
      await fn();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar");
    } finally {
      setPending(null);
    }
  }

  const validShared = sharedAccounts.filter((a): a is SharedAccount => a !== null);
  const money = (cents: number, currency: string) =>
    hidden ? MASK : formatCents(cents, currency);

  return (
    <AppSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Patrimonio neto"
      description="Elige qué suma y qué resta en el total."
    >
      <div className="space-y-5">
        {accounts.length > 0 && (
          <Group
            label="Cuentas"
            hint="suman"
            count={accounts.filter((a) => a.includeInBalance !== false).length}
            total={accounts.length}
          >
            {accounts.map((acc, i) => (
              <Row
                key={acc._id}
                index={i}
                name={acc.name}
                color={acc.color}
                amount={money(acc.balance, acc.currency)}
                included={acc.includeInBalance !== false}
                busy={pending === acc._id}
                onToggle={(include) =>
                  run(acc._id, () => toggleAccount({ accountId: acc._id, include }))
                }
              />
            ))}
          </Group>
        )}

        {cards.length > 0 && (
          <Group
            label="Tarjetas de crédito"
            hint="restan"
            icon={CreditCard}
            count={cards.filter((c) => c.includeInBalance !== false).length}
            total={cards.length}
          >
            {cards.map((card, i) => (
              <Row
                key={card._id}
                index={i}
                name={`${card.name} ····${card.lastFourDigits}`}
                color={card.color}
                amount={money(card.currentBalance, card.currency)}
                negative
                included={card.includeInBalance !== false}
                busy={pending === card._id}
                onToggle={(include) =>
                  run(card._id, () => toggleCard({ cardId: card._id as Id<"cards">, include }))
                }
              />
            ))}
          </Group>
        )}

        {debts.length > 0 && (
          <Group
            label="Deudas"
            hint="restan"
            icon={Scale}
            count={debts.filter((d) => d.includeInBalance !== false).length}
            total={debts.length}
          >
            {debts.map((debt, i) => (
              <Row
                key={debt._id}
                index={i}
                name={debt.name}
                color={debt.color}
                amount={money(debt.currentBalance, debt.currency)}
                negative
                included={debt.includeInBalance !== false}
                busy={pending === debt._id}
                onToggle={(include) =>
                  run(debt._id, () => toggleDebt({ debtId: debt._id as Id<"debts">, include }))
                }
              />
            ))}
          </Group>
        )}

        {loans.length > 0 && (
          <Group
            label="Préstamos por cobrar"
            hint="suman"
            icon={HandCoins}
            count={loans.filter((l) => l.includeInBalance !== false).length}
            total={loans.length}
          >
            {loans.map((loan, i) => (
              <Row
                key={loan._id}
                index={i}
                name={loan.borrower}
                color={loan.color}
                amount={money(loan.currentBalance, loan.currency)}
                included={loan.includeInBalance !== false}
                busy={pending === loan._id}
                onToggle={(include) =>
                  run(loan._id, () => toggleLoan({ loanId: loan._id as Id<"loans">, include }))
                }
              />
            ))}
          </Group>
        )}

        {validShared.length > 0 && (
          <section className="space-y-2">
            <span className={FIELD_LABEL}>Compartidas conmigo</span>
            <div className={cn("rounded-[22px] p-1.5", GLASS_SURFACE)}>
              <ul className="space-y-0.5">
                {validShared.map((acc) => (
                  <li key={acc._id} className="flex items-center gap-3 rounded-[16px] px-3 py-2.5">
                    <Dot name={acc.name} color={acc.color} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold leading-tight text-foreground">
                        {acc.name}
                      </p>
                      <p className="mt-0.5 font-mono-num text-xs tabular-nums text-muted-foreground">
                        {money(acc.balance, acc.currency)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            {/* El cálculo del patrimonio respeta la exclusión que haya puesto su dueño,
                y ese dato no viaja hasta aquí: no podemos prometer que entran. */}
            <p className="px-1 text-[11px] text-muted-foreground">
              Su inclusión la decide quien es dueño de la cuenta, no tú.
            </p>
          </section>
        )}

        {accounts.length === 0 &&
          cards.length === 0 &&
          debts.length === 0 &&
          loans.length === 0 &&
          validShared.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Todavía no hay nada que componga tu patrimonio.
            </p>
          )}
      </div>
    </AppSheet>
  );
}

// ─── Piezas ───────────────────────────────────────────────────────────────────

function Group({
  label,
  hint,
  icon: Icon,
  count,
  total,
  children,
}: {
  label: string;
  /** "suman" o "restan": qué hace este grupo con el total */
  hint: string;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  count: number;
  total: number;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <span className={cn(FIELD_LABEL, "flex items-center gap-1.5")}>
        {Icon && <Icon className="h-3 w-3" aria-hidden="true" />}
        {label} · {count === total ? `${total} ${hint}` : `${count} de ${total} ${hint}`}
      </span>
      <div className={cn("rounded-[22px] p-1.5", GLASS_SURFACE)}>
        <ul className="space-y-0.5">{children}</ul>
      </div>
    </section>
  );
}

function Row({
  index,
  name,
  color,
  amount,
  negative,
  included,
  busy,
  onToggle,
}: {
  index: number;
  name: string;
  color: string;
  amount: string;
  /** Resta del patrimonio en vez de sumar */
  negative?: boolean;
  included: boolean;
  busy: boolean;
  onToggle: (include: boolean) => void;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT_EXPO, delay: Math.min(index, 10) * 0.03 }}
      className="flex list-none items-center gap-3 rounded-[16px] px-3 py-2.5"
    >
      <Dot name={name} color={color} dimmed={!included} />

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-[15px] font-semibold leading-tight",
            included ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {name}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className="font-mono-num tabular-nums"
            style={negative && included ? { color: "var(--os-magenta)" } : undefined}
          >
            {negative ? "−" : ""}
            {amount}
          </span>
          {!included && (
            <span className="flex items-center gap-0.5">
              <EyeOff className="h-2.5 w-2.5" aria-hidden="true" />
              fuera del total
            </span>
          )}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <AnimatePresence>
          {busy && (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
            </motion.span>
          )}
        </AnimatePresence>
        <Switch
          checked={included}
          disabled={busy}
          onCheckedChange={onToggle}
          // Describe el estado, no la acción: junto al `checked`, «Excluir X, activado»
          // se contradice a sí mismo al leerse.
          aria-label={`${name} cuenta en el patrimonio`}
        />
      </div>
    </motion.li>
  );
}

/**
 * Inicial con el color del producto. `color` guarda una CLAVE de degradado
 * («g-night»), no un hex, así que se resuelve con `sourceVisual` — que también
 * acepta los hex de los registros más antiguos.
 */
function Dot({ name, color, dimmed }: { name: string; color: string; dimmed?: boolean }) {
  const { flat } = sourceVisual(color);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold transition-opacity",
        dimmed && "opacity-50",
      )}
      style={{ background: tint(flat, 18), color: flat }}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
