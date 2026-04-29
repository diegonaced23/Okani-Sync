"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/ui/money-input";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { toCents, fromCents, formatCents } from "@/lib/money";

interface DebtPaymentSheetProps {
  debtId: Id<"debts">;
  debtName: string;
  currentBalance: number;
  currency: string;
  suggestedPayment?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DebtPaymentSheet({
  debtId,
  debtName,
  currentBalance,
  currency,
  suggestedPayment,
  open,
  onOpenChange,
}: DebtPaymentSheetProps) {
  const addPayment = useMutation(api.debts.addPayment);
  const accounts = useQuery(api.accounts.list);

  const [amount, setAmount] = useState(
    suggestedPayment ? fromCents(suggestedPayment).toString() : ""
  );
  const [fromAccountId, setFromAccountId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().substring(0, 10));
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountNum = parseFloat(amount) || 0;
    if (amountNum <= 0) { toast.error("El monto debe ser mayor que cero"); return; }

    setLoading(true);
    try {
      await addPayment({
        debtId,
        amount: toCents(amountNum),
        date: new Date(date).getTime(),
        fromAccountId: fromAccountId ? (fromAccountId as Id<"accounts">) : undefined,
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-xl">
        <SheetHeader className="pb-4">
          <SheetTitle>Registrar abono — {debtName}</SheetTitle>
          <p className="text-sm text-muted-foreground">
            Saldo pendiente: {formatCents(currentBalance, currency)}
          </p>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pay-amount">Monto del abono ({currency})</Label>
            <MoneyInput id="pay-amount" placeholder="0"
              value={amount} onChange={setAmount} required />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pay-date">Fecha del abono</Label>
            <DatePicker id="pay-date" value={date} onChange={setDate} required />
          </div>

          <div className="space-y-1.5">
            <Label>Cuenta de origen (opcional)</Label>
            <Select value={fromAccountId} onValueChange={(v) => setFromAccountId(v ?? "")}>
              <SelectTrigger><SelectValue placeholder="Sin cuenta específica" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">Sin cuenta</SelectItem>
                {(accounts ?? []).map((a) => (
                  <SelectItem key={a._id} value={a._id}>
                    {a.name} — {formatCents(a.balance, a.currency)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pay-notes">Notas (opcional)</Label>
            <Textarea id="pay-notes" rows={2} value={notes}
              onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? "Registrando…" : "Registrar abono"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
