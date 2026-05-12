"use client";

import { useState, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import { formatCents } from "@/lib/money";
import { toast } from "sonner";

interface PayCardFormProps {
  cardId: Id<"cards">;
  currency: string;
  mode: "minimo" | "total";
  amount: number;
  targetMonth?: string; // "YYYY-MM" — solo para mode="minimo"
  onSuccess: () => void;
}

export function PayCardForm({
  cardId,
  currency,
  mode,
  amount,
  targetMonth,
  onSuccess,
}: PayCardFormProps) {
  const payMinimum = useMutation(api.cardPurchases.payMinimum);
  const payTotal = useMutation(api.cardPurchases.payTotal);
  const accounts = useQuery(api.accounts.list, {});

  const [fromAccountId, setFromAccountId] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    () => new Date().toISOString().substring(0, 10)
  );
  const [loading, setLoading] = useState(false);

  const validAccounts = useMemo(
    () => (accounts ?? []).filter((a) => a.currency === currency),
    [accounts, currency]
  );

  const selectedAccount = validAccounts.find((a) => a._id === fromAccountId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fromAccountId) {
      toast.error("Selecciona una cuenta de origen");
      return;
    }

    setLoading(true);
    try {
      const paymentTs = new Date(paymentDate).getTime();
      const result = mode === "minimo"
        ? await payMinimum({
            cardId,
            fromAccountId: fromAccountId as Id<"accounts">,
            paymentDate: paymentTs,
            targetMonth,
          })
        : await payTotal({
            cardId,
            fromAccountId: fromAccountId as Id<"accounts">,
            paymentDate: paymentTs,
          });

      const label = mode === "minimo" ? "Pago mínimo" : "Pago total";
      toast.success(`${label} realizado — ${result.paidCount} cuota${result.paidCount !== 1 ? "s" : ""} pagada${result.paidCount !== 1 ? "s" : ""}`);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al realizar el pago");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Monto a pagar */}
      <div className="rounded-xl bg-muted/50 border border-border p-4 text-center space-y-1">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">
          {mode === "minimo" ? "Pago mínimo (cuotas del mes)" : "Pago total (saldo completo)"}
        </p>
        <p className="text-3xl font-bold tabular-nums text-foreground">
          {formatCents(amount, currency)}
        </p>
      </div>

      {/* Cuenta de origen */}
      <div className="space-y-1.5">
        <Label>Cuenta de origen</Label>
        {validAccounts.length === 0 ? (
          <p className="text-sm text-muted-foreground rounded-lg border border-border px-3 py-2">
            No tienes cuentas en {currency}. Crea una cuenta en esa moneda primero.
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
        disabled={loading || validAccounts.length === 0 || !fromAccountId}
      >
        {loading ? "Procesando…" : "Confirmar pago"}
      </Button>
    </form>
  );
}
