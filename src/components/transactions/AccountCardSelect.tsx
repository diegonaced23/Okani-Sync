"use client";

import type { Doc } from "../../../convex/_generated/dataModel";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
} from "@/components/ui/select";
import { formatCents } from "@/lib/money";

interface AccountCardSelectProps {
  id?: string;
  value: string; // codificado: "account:ID" | "card:ID" | ""
  onValueChange: (v: string) => void;
  accounts: Doc<"accounts">[];
  cards?: Doc<"cards">[];
  showCards?: boolean; // true para gastos; false para ingresos (solo cuentas)
  placeholder?: string;
}

// Select unificado de cuenta o tarjeta — comparte UI entre TransactionForm y TransactionDetailSheet.
// El valor se codifica como "account:ID" o "card:ID" para distinguir el tipo de fuente.
export function AccountCardSelect({
  id,
  value,
  onValueChange,
  accounts,
  cards = [],
  showCards = false,
  placeholder = "Sin origen",
}: AccountCardSelectProps) {
  const [sourceKind, sourceRawId] = value.includes(":") ? value.split(":") : ["", ""];
  const selectedAccount = sourceKind === "account" ? accounts.find((a) => a._id === sourceRawId) : undefined;
  const selectedCard    = sourceKind === "card"    ? cards.find((c) => c._id === sourceRawId)    : undefined;

  return (
    <Select value={value} onValueChange={(v) => onValueChange(v ?? "")}>
      <SelectTrigger id={id} className="w-full" style={{ background: "var(--surface-2)" }}>
        <span className="flex-1 text-left text-sm truncate">
          {selectedAccount ? (
            `${selectedAccount.name} · ${formatCents(selectedAccount.balance, selectedAccount.currency)}`
          ) : selectedCard ? (
            `${selectedCard.name} ····${selectedCard.lastFourDigits} · ${formatCents(selectedCard.availableCredit, selectedCard.currency)} disp.`
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </span>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} className="max-h-[40vh]">
        <SelectItem value="">{placeholder}</SelectItem>
        {accounts.length > 0 && (
          <SelectGroup>
            <SelectLabel>Cuentas</SelectLabel>
            {accounts.map((a) => (
              <SelectItem key={a._id} value={`account:${a._id}`}>
                {a.name} · {formatCents(a.balance, a.currency)}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {showCards && cards.length > 0 && (
          <>
            {accounts.length > 0 && <SelectSeparator />}
            <SelectGroup>
              <SelectLabel>Tarjetas de crédito</SelectLabel>
              {cards.map((c) => (
                <SelectItem key={c._id} value={`card:${c._id}`}>
                  {c.name} ····{c.lastFourDigits} · {formatCents(c.availableCredit, c.currency)} disp.
                </SelectItem>
              ))}
            </SelectGroup>
          </>
        )}
      </SelectContent>
    </Select>
  );
}
