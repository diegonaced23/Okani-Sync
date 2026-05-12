"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AppSheet } from "@/components/ui/app-sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/ui/money-input";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import { toast } from "sonner";
import { toCents, fromCents, formatCents } from "@/lib/money";

interface LoanRepaymentSheetProps {
  loanId: Id<"loans">;
  loanName: string;
  borrower: string;
  currentBalance: number;
  currency: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LoanRepaymentSheet({
  loanId,
  loanName,
  borrower,
  currentBalance,
  currency,
  open,
  onOpenChange,
}: LoanRepaymentSheetProps) {
  const addRepayment = useMutation(api.loans.addRepayment);
  const accounts = useQuery(api.accounts.list);

  const [amount, setAmount]               = useState(fromCents(currentBalance).toString());
  const [toAccountId, setToAccountId]     = useState("");
  const [date, setDate]                   = useState(() => new Date().toISOString().substring(0, 10));
  const [notes, setNotes]                 = useState("");
  const [loading, setLoading]             = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountNum = parseFloat(amount) || 0;
    if (amountNum <= 0) { toast.error("El monto debe ser mayor que cero"); return; }

    setLoading(true);
    try {
      await addRepayment({
        loanId,
        amount: toCents(amountNum),
        date: new Date(date).getTime(),
        toAccountId: toAccountId ? (toAccountId as Id<"accounts">) : undefined,
        notes: notes.trim() || undefined,
      });
      toast.success("Abono registrado correctamente");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al registrar abono");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Registrar abono — ${loanName}`}
      description={`${borrower} · Pendiente: ${formatCents(currentBalance, currency)}`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="repay-amount">
            Monto del abono ({currency}) <span className="text-danger" aria-hidden>*</span>
          </Label>
          <MoneyInput
            id="repay-amount"
            placeholder="0"
            value={amount}
            onChange={setAmount}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="repay-date">Fecha del abono</Label>
          <DatePicker id="repay-date" value={date} onChange={setDate} required />
        </div>

        <div className="space-y-1.5">
          <Label>Cuenta destino (opcional)</Label>
          <Select value={toAccountId} onValueChange={(v) => setToAccountId(v ?? "")}>
            <SelectTrigger>
              <span className="flex-1 text-left text-sm truncate">
                {toAccountId
                  ? (() => {
                      const a = (accounts ?? []).find((x) => x._id === toAccountId);
                      return a ? `${a.name} — ${formatCents(a.balance, a.currency)}` : "Cuenta";
                    })()
                  : <span className="text-muted-foreground">Sin cuenta específica</span>}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Sin cuenta</SelectItem>
              {(accounts ?? []).map((a) => (
                <SelectItem key={a._id} value={a._id}>
                  {a.name} — {formatCents(a.balance, a.currency)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Si seleccionas una cuenta, el abono se acreditará en ella.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="repay-notes">Notas (opcional)</Label>
          <Textarea
            id="repay-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="submit" className="flex-1" disabled={loading}>
            {loading ? "Registrando…" : "Registrar abono"}
          </Button>
        </div>
      </form>
    </AppSheet>
  );
}
