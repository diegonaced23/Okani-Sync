"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { toCents } from "@/lib/money";
import { CURRENCIES, ACCOUNT_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const DEBT_TYPES = [
  { value: "prestamo", label: "Préstamo bancario" },
  { value: "personal", label: "Deuda personal" },
  { value: "hipoteca", label: "Hipoteca" },
  { value: "vehiculo", label: "Vehículo" },
  { value: "otro", label: "Otro" },
] as const;

export function DebtForm({ onSuccess }: { onSuccess?: () => void }) {
  const createDebt = useMutation(api.debts.create);

  const [name, setName] = useState("");
  const [creditor, setCreditor] = useState("");
  const [type, setType] = useState<"prestamo" | "personal" | "hipoteca" | "vehiculo" | "otro">("prestamo");
  const [originalAmount, setOriginalAmount] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [monthlyPayment, setMonthlyPayment] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().substring(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [currency, setCurrency] = useState("COP");
  const [color, setColor] = useState(ACCOUNT_COLORS[3]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(originalAmount) || 0;
    if (!name.trim() || !creditor.trim() || amount <= 0) {
      toast.error("Completa nombre, acreedor y monto");
      return;
    }
    setLoading(true);
    try {
      await createDebt({
        name: name.trim(),
        creditor: creditor.trim(),
        type,
        originalAmount: toCents(amount),
        interestRate: interestRate ? parseFloat(interestRate) / 100 : undefined,
        monthlyPayment: monthlyPayment ? toCents(parseFloat(monthlyPayment)) : undefined,
        startDate: new Date(startDate).getTime(),
        dueDate: dueDate ? new Date(dueDate).getTime() : undefined,
        currency,
        color,
        icon: "hand-coins",
        notes: notes.trim() || undefined,
      });
      toast.success("Deuda registrada");
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
        <Label htmlFor="debt-name">Nombre de la deuda</Label>
        <Input id="debt-name" placeholder="Ej: Crédito libre inversión" value={name}
          onChange={(e) => setName(e.target.value)} required />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="debt-creditor">Acreedor</Label>
          <Input id="debt-creditor" placeholder="Banco / Persona" value={creditor}
            onChange={(e) => setCreditor(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>Tipo</Label>
          <Select value={type} onValueChange={(v) => { if (v) setType(v as typeof type); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {DEBT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="debt-amount">Monto original</Label>
          <Input id="debt-amount" type="number" min="1" step="any" placeholder="0"
            value={originalAmount} onChange={(e) => setOriginalAmount(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>Moneda</Label>
          <Select value={currency} onValueChange={(v) => { if (v) setCurrency(v); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="debt-rate">Tasa mensual % (opcional)</Label>
          <Input id="debt-rate" type="number" min="0" step="0.01" placeholder="Ej: 1.8"
            value={interestRate} onChange={(e) => setInterestRate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="debt-payment">Cuota mensual (opcional)</Label>
          <Input id="debt-payment" type="number" min="0" step="any" placeholder="0"
            value={monthlyPayment} onChange={(e) => setMonthlyPayment(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="debt-start">Fecha inicio</Label>
          <Input id="debt-start" type="date" value={startDate}
            onChange={(e) => setStartDate(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="debt-due">Fecha límite (opcional)</Label>
          <Input id="debt-due" type="date" value={dueDate}
            onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Color</Label>
        <div className="flex flex-wrap gap-2">
          {ACCOUNT_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)}
              className={cn("h-7 w-7 rounded-full border-2 transition-transform",
                color === c ? "border-foreground scale-110" : "border-transparent")}
              style={{ backgroundColor: c }} />
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="debt-notes">Notas (opcional)</Label>
        <Textarea id="debt-notes" rows={2} value={notes}
          onChange={(e) => setNotes(e.target.value)} />
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Guardando…" : "Registrar deuda"}
      </Button>
    </form>
  );
}
