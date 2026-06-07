"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { useAppData } from "@/contexts/app-data";

type Account = Doc<"accounts">;
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
} from "@/components/ui/select";
import { toast } from "sonner";
import { toCents, formatCents, dateStrToTs, todayStr } from "@/lib/money";
import { ArrowDown, Check } from "lucide-react";

interface TransferFormProps {
  onSuccess?: () => void;
}

export function TransferForm({ onSuccess }: TransferFormProps) {
  const { accounts } = useAppData();
  const createTransfer = useMutation(api.transactions.createTransfer);
  // listSharedWithMe es un endpoint diferente; se combina con las cuentas propias del contexto
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
  const [date, setDate] = useState(todayStr);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const fromAccount = allAccounts.find((a) => a._id === fromAccountId);
  const toAccount = allAccounts.find((a) => a._id === toAccountId);
  const needsRate =
    fromAccount && toAccount && fromAccount.currency !== toAccount.currency;
  const amountNum = parseFloat(amount) || 0;
  const rateNum = parseFloat(exchangeRate) || 1;
  const toAmount = needsRate ? Math.round(amountNum * rateNum * 100) / 100 : amountNum;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Validación de campos: errores inline (no toast) para feedback inmediato
    const errors: Record<string, string> = {};
    if (!fromAccountId || !toAccountId) {
      errors.accounts = "Selecciona las cuentas de origen y destino";
    } else if (fromAccountId === toAccountId) {
      errors.accounts = "Las cuentas deben ser distintas";
    }
    if (amountNum <= 0) errors.amount = "El monto debe ser mayor que cero";
    if (needsRate && !rateNum) errors.exchangeRate = "Ingresa la tasa de cambio";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    setLoading(true);
    try {
      await createTransfer({
        fromAccountId: fromAccountId as Id<"accounts">,
        toAccountId: toAccountId as Id<"accounts">,
        amount: toCents(amountNum),
        date: dateStrToTs(date),
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
      {/* Cuentas — apiladas verticalmente con flecha de ilusión de transferencia */}
      <div className="space-y-1">
        <div>
          <p className="text-[12px] font-semibold text-foreground mb-2">Origen</p>
          <Select
            value={fromAccountId}
            onValueChange={(v) => { if (v) { setFromAccountId(v); if (fieldErrors.accounts) setFieldErrors((fe) => ({ ...fe, accounts: "" })); } }}
          >
            <SelectTrigger className="w-full">
              <span className="flex-1 text-left text-sm truncate">
                {fromAccount
                  ? `${fromAccount.name} (${fromAccount.currency})`
                  : <span className="text-muted-foreground">Seleccionar cuenta</span>}
              </span>
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

        {/* Flecha hacia abajo — ilusión de flujo de transferencia */}
        <div className="flex justify-center py-1">
          <span
            className="flex items-center justify-center rounded-full"
            style={{
              width: 28, height: 28,
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
            }}
          >
            <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
          </span>
        </div>

        <div>
          <p className="text-[12px] font-semibold text-foreground mb-2">Destino</p>
          <Select
            value={toAccountId}
            onValueChange={(v) => { if (v) { setToAccountId(v); if (fieldErrors.accounts) setFieldErrors((fe) => ({ ...fe, accounts: "" })); } }}
          >
            <SelectTrigger className="w-full">
              <span className="flex-1 text-left text-sm truncate">
                {toAccount
                  ? `${toAccount.name} (${toAccount.currency})`
                  : <span className="text-muted-foreground">Seleccionar cuenta</span>}
              </span>
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
        {fieldErrors.accounts && (
          <p id="tf-accounts-error" role="alert" className="text-xs text-destructive mt-1.5">
            {fieldErrors.accounts}
          </p>
        )}
      </div>

      {/* Monto */}
      <div>
        <p className="text-[12px] font-semibold text-foreground mb-2">
          Monto{fromAccount ? ` (${fromAccount.currency})` : ""}
        </p>
        <div
          className="flex items-center justify-center rounded-xl focus-within:ring-2 focus-within:ring-ring"
          style={{
            background: "var(--surface-2)",
            padding: "18px 16px",
            "--ring": "var(--os-cyan)",
          } as React.CSSProperties}
        >
          <MoneyInput
            id="tf-amount"
            placeholder="0"
            value={amount}
            onChange={(v) => { setAmount(v); if (fieldErrors.amount) setFieldErrors((fe) => ({ ...fe, amount: "" })); }}
            required
            aria-invalid={!!fieldErrors.amount}
            aria-describedby={fieldErrors.amount ? "tf-amount-error" : undefined}
            className="text-center border-none bg-transparent shadow-none focus-visible:ring-0 font-mono-num p-0 h-auto"
            style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.025em" }}
          />
        </div>
        {fromAccount && (
          <p className="text-xs text-muted-foreground mt-1.5">
            Saldo disponible: {formatCents(fromAccount.balance, fromAccount.currency)}
          </p>
        )}
        {fieldErrors.amount && (
          <p id="tf-amount-error" role="alert" className="text-xs text-destructive mt-1.5">
            {fieldErrors.amount}
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
              onChange={(e) => { setExchangeRate(e.target.value); if (fieldErrors.exchangeRate) setFieldErrors((fe) => ({ ...fe, exchangeRate: "" })); }}
              required
              aria-invalid={!!fieldErrors.exchangeRate}
              aria-describedby={fieldErrors.exchangeRate ? "tf-rate-error" : undefined}
            />
            {fieldErrors.exchangeRate && (
              <p id="tf-rate-error" role="alert" className="text-xs text-destructive">
                {fieldErrors.exchangeRate}
              </p>
            )}
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

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 rounded-xl font-bold transition-all active:scale-[0.98] disabled:opacity-60 mt-2"
        style={{
          padding: "15px 18px",
          fontSize: 15,
          background: "linear-gradient(135deg, var(--os-cyan), var(--os-lime))",
          color: "var(--primary-foreground)",
          border: "none",
          cursor: loading ? "not-allowed" : "pointer",
          boxShadow: "0 8px 20px -6px color-mix(in oklch, var(--os-cyan) 55%, transparent)",
        }}
      >
        <Check className="h-4 w-4" strokeWidth={2.5} />
        {loading ? "Procesando…" : "Registrar transferencia"}
      </button>
    </form>
  );
}
