"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/ui/money-input";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import { toast } from "sonner";
import { toCents, fromCents, formatCents } from "@/lib/money";
import { CURRENCIES, ACCOUNT_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface LoanFormProps {
  loan?: Doc<"loans">;
  onSuccess?: () => void;
}

export function LoanForm({ loan, onSuccess }: LoanFormProps) {
  const createLoan = useMutation(api.loans.create);
  const updateLoan = useMutation(api.loans.update);
  const accounts   = useQuery(api.accounts.list);

  const isEdit = !!loan;

  const [name, setName]               = useState(loan?.name ?? "");
  const [borrower, setBorrower]       = useState(loan?.borrower ?? "");
  const [originalAmount, setOriginalAmount] = useState(
    loan ? fromCents(loan.originalAmount).toString() : ""
  );
  const [currency, setCurrency]       = useState(loan?.currency ?? "COP");
  const [startDate, setStartDate]     = useState(
    loan ? new Date(loan.startDate).toISOString().substring(0, 10)
         : new Date().toISOString().substring(0, 10)
  );
  const [dueDate, setDueDate]         = useState(
    loan?.dueDate ? new Date(loan.dueDate).toISOString().substring(0, 10) : ""
  );
  const [fromAccountId, setFromAccountId] = useState("");
  const [color, setColor]             = useState(loan?.color ?? ACCOUNT_COLORS[0]);
  const [notes, setNotes]             = useState(loan?.notes ?? "");
  const [loading, setLoading]         = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !borrower.trim()) {
      toast.error("Completa el nombre y la persona");
      return;
    }

    setLoading(true);
    try {
      if (loan) {
        await updateLoan({
          loanId: loan._id,
          name: name.trim(),
          borrower: borrower.trim(),
          dueDate: dueDate ? new Date(dueDate).getTime() : undefined,
          color,
          notes: notes.trim() || undefined,
        });
        toast.success("Préstamo actualizado");
      } else {
        const amount = parseFloat(originalAmount) || 0;
        if (amount <= 0) { toast.error("El monto debe ser mayor que cero"); return; }
        await createLoan({
          name: name.trim(),
          borrower: borrower.trim(),
          originalAmount: toCents(amount),
          currency,
          startDate: new Date(startDate).getTime(),
          dueDate: dueDate ? new Date(dueDate).getTime() : undefined,
          fromAccountId: fromAccountId ? (fromAccountId as Id<"accounts">) : undefined,
          color,
          icon: "hand-coins",
          notes: notes.trim() || undefined,
        });
        toast.success("Préstamo registrado");
      }
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="loan-name">
          Nombre del préstamo <span className="text-danger" aria-hidden>*</span>
        </Label>
        <Input
          id="loan-name"
          placeholder="Ej: Préstamo para mudanza"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="loan-borrower">
          Persona a quien le prestas <span className="text-danger" aria-hidden>*</span>
        </Label>
        <Input
          id="loan-borrower"
          placeholder="Ej: Juan Pérez"
          value={borrower}
          onChange={(e) => setBorrower(e.target.value)}
          required
        />
      </div>

      {/* Monto + moneda — deshabilitados al editar */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="loan-amount">
            Monto <span className="text-danger" aria-hidden>*</span>
          </Label>
          <MoneyInput
            id="loan-amount"
            placeholder="0"
            value={originalAmount}
            onChange={setOriginalAmount}
            required={!isEdit}
            disabled={isEdit}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Moneda</Label>
          <Select
            value={currency}
            onValueChange={(v) => { if (v) setCurrency(v); }}
            disabled={isEdit}
          >
            <SelectTrigger>
              <span className="flex-1 text-left text-sm truncate">{currency}</span>
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Fechas */}
      <div className="grid grid-cols-2 gap-3">
        <div className={cn("space-y-1.5", isEdit && "opacity-50 pointer-events-none")}>
          <Label htmlFor="loan-start">
            Fecha del préstamo {!isEdit && <span className="text-danger" aria-hidden>*</span>}
          </Label>
          <DatePicker
            id="loan-start"
            value={startDate}
            onChange={setStartDate}
            required={!isEdit}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="loan-due">Fecha de devolución</Label>
          <DatePicker id="loan-due" value={dueDate} onChange={setDueDate} />
        </div>
      </div>

      {/* Cuenta de origen — solo al crear */}
      {!isEdit && (
        <div className="space-y-1.5">
          <Label>Cuenta de origen (opcional)</Label>
          <Select
            value={fromAccountId}
            onValueChange={(v) => setFromAccountId(v ?? "")}
          >
            <SelectTrigger>
              <span className="flex-1 text-left text-sm truncate">
                {fromAccountId
                  ? (() => {
                      const a = (accounts ?? []).find((x) => x._id === fromAccountId);
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
            Si seleccionas una cuenta, se registrará como gasto en esa cuenta.
          </p>
        </div>
      )}

      {/* Color */}
      <div className="space-y-1.5">
        <Label>Color</Label>
        <div className="flex flex-wrap gap-2">
          {ACCOUNT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={cn(
                "h-7 w-7 rounded-full border-2 transition-transform",
                color === c ? "border-foreground scale-110" : "border-transparent"
              )}
              style={{ backgroundColor: c }}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
      </div>

      {/* Notas */}
      <div className="space-y-1.5">
        <Label htmlFor="loan-notes">Notas (opcional)</Label>
        <Textarea
          id="loan-notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Condiciones, detalles del acuerdo…"
        />
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading
          ? isEdit ? "Guardando…" : "Registrando…"
          : isEdit ? "Guardar cambios" : "Registrar préstamo"}
      </Button>
    </form>
  );
}
