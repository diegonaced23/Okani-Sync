"use client";

import type { Doc } from "../../../convex/_generated/dataModel";
import { SourceChip } from "@/components/ui/source-chip";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { OVERFLOW_ROW, haptic } from "./shared";

interface AccountCardSelectProps {
  id?: string;
  /** Nombre accesible del grupo: el visible cambia según el tipo de movimiento. */
  ariaLabel?: string;
  value: string; // codificado: "account:ID" | "card:ID" | ""
  onValueChange: (v: string) => void;
  accounts: Doc<"accounts">[];
  cards?: Doc<"cards">[];
  showCards?: boolean; // true para gastos; false para ingresos (solo cuentas)
  placeholder?: string;
  /** false quita la opción vacía: en edición el origen se cambia, no se quita. */
  allowEmpty?: boolean;
}

/**
 * Origen del movimiento como fila de fichas, con el mismo `SourceChip` que usan las
 * hojas de abono y de pago: cada cuenta muestra su color y su saldo, cada tarjeta su
 * cupo disponible. El valor sigue codificado como "account:ID" o "card:ID", así que
 * los formularios que lo consumen no cambiaron.
 */
export function AccountCardSelect({
  id,
  ariaLabel = "Origen",
  value,
  onValueChange,
  accounts,
  cards = [],
  showCards = false,
  placeholder = "Sin origen",
  allowEmpty = true,
}: AccountCardSelectProps) {
  return (
    <div id={id} role="radiogroup" aria-label={ariaLabel} className={OVERFLOW_ROW}>
      {allowEmpty && (
        <button
          type="button"
          role="radio"
          aria-checked={value === ""}
          onClick={() => { haptic(); onValueChange(""); }}
          className={cn(
            "flex shrink-0 items-center rounded-[14px] border px-3 py-2 text-[13px] font-semibold transition-[background-color,border-color,transform] active:scale-95",
            value === ""
              ? "border-foreground/30 bg-muted text-foreground"
              : "border-border bg-[var(--surface-2)] text-muted-foreground",
          )}
        >
          {placeholder}
        </button>
      )}

      {accounts.map((a) => (
        <SourceChip
          key={a._id}
          selected={value === `account:${a._id}`}
          onSelect={() => { haptic(); onValueChange(`account:${a._id}`); }}
          color={a.color}
          name={a.name}
          detail={formatCents(a.balance, a.currency)}
        />
      ))}

      {showCards &&
        cards.map((c) => (
          <SourceChip
            key={c._id}
            selected={value === `card:${c._id}`}
            onSelect={() => { haptic(); onValueChange(`card:${c._id}`); }}
            color={c.color}
            name={`${c.name} ····${c.lastFourDigits}`}
            detail={`${formatCents(c.availableCredit, c.currency)} disp.`}
            isCard
          />
        ))}
    </div>
  );
}
