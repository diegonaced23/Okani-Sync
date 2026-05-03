"use client";

import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { AppSheet } from "@/components/ui/app-sheet";
import { Switch } from "@/components/ui/switch";
import { formatCents } from "@/lib/money";
import { toast } from "sonner";
import { useState } from "react";

interface BalanceAccountsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Doc<"accounts">[];
  sharedAccounts: (Doc<"accounts"> | null)[];
}

export function BalanceAccountsSheet({
  open,
  onOpenChange,
  accounts,
  sharedAccounts,
}: BalanceAccountsSheetProps) {
  const toggle = useMutation(api.accounts.toggleBalanceInclusion);
  const [pending, setPending] = useState<string | null>(null);

  async function handleToggle(account: Doc<"accounts">, include: boolean) {
    setPending(account._id);
    try {
      await toggle({ accountId: account._id, include });
    } catch {
      toast.error("No se pudo actualizar la cuenta");
    } finally {
      setPending(null);
    }
  }

  const validShared = sharedAccounts.filter((a): a is Doc<"accounts"> => a !== null);

  return (
    <AppSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Patrimonio total"
      description="Selecciona las cuentas que se incluyen en el cálculo."
    >
      <div className="space-y-4">
        {/* Cuentas propias */}
        {accounts.length > 0 && (
          <section className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
              Mis cuentas
            </p>
            <div className="rounded-xl bg-card border border-border overflow-hidden">
              <ul className="divide-y divide-border">
                {accounts.map((acc) => {
                  const included = acc.includeInBalance !== false;
                  return (
                    <li
                      key={acc._id}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      {/* Ícono de color */}
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                        style={{ backgroundColor: acc.color + "33", color: acc.color }}
                      >
                        {acc.name.charAt(0).toUpperCase()}
                      </span>

                      {/* Nombre y saldo */}
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm font-medium truncate"
                          style={{ color: included ? "var(--foreground)" : "var(--muted-foreground)" }}
                        >
                          {acc.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatCents(acc.balance, acc.currency)}
                        </p>
                      </div>

                      {/* Switch */}
                      <Switch
                        checked={included}
                        disabled={pending === acc._id}
                        onCheckedChange={(checked) => handleToggle(acc, checked)}
                        aria-label={`${included ? "Excluir" : "Incluir"} ${acc.name} del patrimonio`}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        )}

        {/* Cuentas compartidas (solo lectura — el dueño controla la inclusión) */}
        {validShared.length > 0 && (
          <section className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
              Compartidas conmigo
            </p>
            <div className="rounded-xl bg-card border border-border overflow-hidden">
              <ul className="divide-y divide-border">
                {validShared.map((acc) => (
                  <li
                    key={acc._id}
                    className="flex items-center gap-3 px-4 py-3 opacity-60"
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                      style={{ backgroundColor: acc.color + "33", color: acc.color }}
                    >
                      {acc.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{acc.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatCents(acc.balance, acc.currency)}
                      </p>
                    </div>
                    <span className="text-[11px] text-muted-foreground shrink-0">Incluida</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-[11px] text-muted-foreground px-0.5">
              Las cuentas compartidas siempre se incluyen en el total.
            </p>
          </section>
        )}

        {accounts.length === 0 && validShared.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">
            No tienes cuentas activas.
          </p>
        )}
      </div>
    </AppSheet>
  );
}
