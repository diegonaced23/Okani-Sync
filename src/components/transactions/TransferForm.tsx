"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";

type Account = Doc<"accounts">;
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/ui/money-input";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { toCents, formatCents } from "@/lib/money";
import { ArrowRight } from "lucide-react";

interface TransferFormProps {
  onSuccess?: () => void;
}

export function TransferForm({ onSuccess }: TransferFormProps) {
  const createTransfer = useMutation(api.transactions.createTransfer);
  const accounts = useQuery(api.accounts.list);
  const sharedAccounts = useQuery(api.accounts.listSharedWithMe);

  const allAccounts: Account[] = [
    ...(accounts ?? []),
    ...(sharedAccounts ?? []).filter((a): a is Account => a !== null),
  ];

  const [fromAccountId, setFromAccountId] = useState<string>("");
  const [toAccountId, setToAccountId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [exchangeRate, setExchangeRate] = useState("");
  const [description, setDescription] = useState("Transferencia");
  const [date, setDate] = useState(() => new Date().toISOString().substring(0, 10));
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const fromAccount = allAccounts.find((a) => a._id === fromAccountId);
  const toAccount = allAccounts.find((a) => a._id === toAccountId);
  const needsRate =
    fromAccount && toAccount && fromAccount.currency !== toAccount.currency;
  const amountNum = parseFloat(amount) || 0;
  const rateNum = parseFloat(exchangeRate) || 1;
  const toAmount = needsRate ? Math.round(amountNum * rateNum * 100) / 100 : amountNum;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fromAccountId || !toAccountId) {
      toast.error("Selecciona las cuentas de origen y destino");
      return;
    }
    if (fromAccountId === toAccountId) {
      toast.error("Las cuentas deben ser distintas");
      return;
    }
    if (amountNum <= 0) {
      toast.error("El monto debe ser mayor que cero");
      return;
    }
    if (needsRate && !rateNum) {
      toast.error("Ingresa la tasa de cambio");
      return;
    }

    setLoading(true);
    try {
      await createTransfer({
        fromAccountId: fromAccountId as Id<"accounts">,
        toAccountId: toAccountId as Id<"accounts">,
        amount: toCents(amountNum),
        date: new Date(date).getTime(),
        description: description.trim() || "Transferencia",
        exchangeRate: needsRate ? rateNum : undefined,
        notes: notes.trim() || undefined,
      });
      toast.success("Transferencia registrada");
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al transferir");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Cuentas */}
      <div className="grid grid-cols-[1fr,auto,1fr] items-end gap-2">
        <div className="space-y-1.5">
          <Label>Origen</Label>
          <Select
            value={fromAccountId}
            onValueChange={(v) => { if (v) setFromAccountId(v); }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar" />
            </SelectTrigger>
            <SelectContent>
              {allAccounts.map((a) => (
                <SelectItem key={a._id} value={a._id}>
                  {a.name} ({a.currency})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground mb-2.5" />
        <div className="space-y-1.5">
          <Label>Destino</Label>
          <Select
            value={toAccountId}
            onValueChange={(v) => { if (v) setToAccountId(v); }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar" />
            </SelectTrigger>
            <SelectContent>
              {allAccounts
                .filter((a) => a._id !== fromAccountId)
                .map((a) => (
                  <SelectItem key={a._id} value={a._id}>
                    {a.name} ({a.currency})
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Monto */}
      <div className="space-y-1.5">
        <Label htmlFor="tf-amount">
          Monto{fromAccount ? ` (${fromAccount.currency})` : ""}
        </Label>
        <MoneyInput
          id="tf-amount"
          placeholder="0,00"
          value={amount}
          onChange={setAmount}
          required
        />
        {fromAccount && (
          <p className="text-xs text-muted-foreground">
            Saldo disponible: {formatCents(fromAccount.balance, fromAccount.currency)}
          </p>
        )}
      </div>

      {/* Tasa de cambio (solo si monedas diferentes) */}
      {needsRate && (
        <div className="rounded-lg bg-warning/10 border border-warning/20 p-3 space-y-2">
          <p className="text-xs text-warning font-medium">
            Monedas distintas: {fromAccount!.currency} → {toAccount!.currency}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="tf-rate">
              Tasa de cambio (1 {fromAccount!.currency} = ? {toAccount!.currency})
            </Label>
            <Input
              id="tf-rate"
              type="number"
              min="0.000001"
              step="any"
              placeholder="Ej: 4200"
              value={exchangeRate}
              onChange={(e) => setExchangeRate(e.target.value)}
              required
            />
            {amountNum > 0 && rateNum > 0 && (
              <p className="text-xs text-muted-foreground">
                Recibirás: {formatCents(toCents(toAmount), toAccount!.currency)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Descripción */}
      <div className="space-y-1.5">
        <Label htmlFor="tf-desc">Descripción</Label>
        <Input
          id="tf-desc"
          placeholder="Ej: Traslado de ahorros"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {/* Fecha */}
      <div className="space-y-1.5">
        <Label htmlFor="tf-date">Fecha</Label>
        <DatePicker id="tf-date" value={date} onChange={setDate} required />
      </div>

      {/* Notas */}
      <div className="space-y-1.5">
        <Label htmlFor="tf-notes">Notas (opcional)</Label>
        <Textarea
          id="tf-notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Procesando…" : "Registrar transferencia"}
      </Button>
    </form>
  );
}
