"use client";

import { useState, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import { formatCents, toCents, fromCents } from "@/lib/money";
import { toast } from "sonner";

interface PayCardFormProps {
  card: Doc<"cards">;
  onSuccess: () => void;
}

export function PayCardForm({ card, onSuccess }: PayCardFormProps) {
  const payCard = useMutation(api.cards.payCard);
  const accounts = useQuery(api.accounts.list, {});

  const [fromAccountId, setFromAccountId] = useState("");
  const [amountStr, setAmountStr] = useState(
    () => String(fromCents(card.currentBalance))
  );
  const [paymentDate, setPaymentDate] = useState(
    () => new Date().toISOString().substring(0, 10)
  );
  const [loading, setLoading] = useState(false);

  const validAccounts = useMemo(
    () => (accounts ?? []).filter((a) => a.currency === card.currency),
    [accounts, card.currency]
  );

  const selectedAccount = validAccounts.find((a) => a._id === fromAccountId);
  const amountCents = toCents(parseFloat(amountStr) || 0);
  const isOverBalance = amountCents > card.currentBalance;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fromAccountId) {
      toast.error("Selecciona una cuenta de origen");
      return;
    }
    if (amountCents <= 0) {
      toast.error("El monto debe ser mayor que cero");
      return;
    }

    setLoading(true);
    try {
      const paymentTs = new Date(paymentDate + "T12:00:00").getTime();
      await payCard({
        cardId: card._id,
        fromAccountId: fromAccountId as Id<"accounts">,
        amount: amountCents,
        paymentDate: paymentTs,
      });
      toast.success(`Pago de ${formatCents(amountCents, card.currency)} registrado`);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al realizar el pago");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Resumen de deuda */}
      <div className="rounded-xl bg-muted/50 border border-border p-4 text-center space-y-1">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">
          Saldo pendiente
        </p>
        <p className="text-3xl font-bold tabular-nums text-foreground">
          {formatCents(card.currentBalance, card.currency)}
        </p>
      </div>

      {/* Monto a pagar */}
      <div className="space-y-1.5">
        <Label>Monto a pagar</Label>
        <MoneyInput
          value={amountStr}
          onChange={setAmountStr}
          placeholder="0"
        />
        <div className="flex gap-2 mt-1">
          <button
            type="button"
            className="text-xs text-muted-foreground underline underline-offset-2"
            onClick={() => setAmountStr(String(fromCents(card.currentBalance)))}
          >
            Pagar todo ({formatCents(card.currentBalance, card.currency)})
          </button>
        </div>
        {isOverBalance && (
          <p className="text-xs text-amber-500">
            El monto supera el saldo. Se aplicará el máximo disponible ({formatCents(card.currentBalance, card.currency)}).
          </p>
        )}
      </div>

      {/* Cuenta de origen */}
      <div className="space-y-1.5">
        <Label>Cuenta de origen</Label>
        {validAccounts.length === 0 ? (
          <p className="text-sm text-muted-foreground rounded-lg border border-border px-3 py-2">
            No tienes cuentas en {card.currency}. Crea una cuenta en esa moneda primero.
          </p>
        ) : (
          <Select value={fromAccountId} onValueChange={(v) => setFromAccountId(v ?? "")}>
            <SelectTrigger>
              <span className="flex-1 text-left text-sm truncate">
                {selectedAccount
                  ? selectedAccount.name
                  : <span className="text-muted-foreground">Seleccionar cuenta…</span>}
              </span>
            </SelectTrigger>
            <SelectContent>
              {validAccounts.map((a) => (
                <SelectItem key={a._id} value={a._id}>
                  <span className="flex items-center gap-2">
                    <span>{a.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatCents(a.balance, a.currency)}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Fecha de pago */}
      <div className="space-y-1.5">
        <Label>Fecha de pago</Label>
        <DatePicker value={paymentDate} onChange={setPaymentDate} required />
      </div>

      <Button
        type="submit"
        className="w-full"
        disabled={loading || validAccounts.length === 0 || !fromAccountId || amountCents <= 0}
      >
        {loading ? "Procesando…" : "Confirmar pago"}
      </Button>
    </form>
  );
}
