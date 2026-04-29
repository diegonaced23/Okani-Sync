"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { toCents, currentMonth } from "@/lib/money";

interface BudgetFormProps {
  defaultMonth?: string;
  onSuccess?: () => void;
}

export function BudgetForm({ defaultMonth, onSuccess }: BudgetFormProps) {
  const createBudget = useMutation(api.budgets.create);
  const categories = useQuery(api.categories.list, { type: "gasto" });

  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [month, setMonth] = useState(defaultMonth ?? currentMonth());
  const [alertThreshold, setAlertThreshold] = useState("80");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountNum = parseFloat(amount) || 0;
    if (!categoryId || amountNum <= 0) {
      toast.error("Selecciona una categoría y un monto mayor que cero");
      return;
    }
    setLoading(true);
    try {
      await createBudget({
        categoryId: categoryId as Parameters<typeof createBudget>[0]["categoryId"],
        amount: toCents(amountNum),
        currency: "COP",
        month,
        alertThreshold: parseInt(alertThreshold) || 80,
      });
      toast.success("Presupuesto creado");
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
        <Label>Categoría</Label>
        <Select value={categoryId} onValueChange={(v) => { if (v) setCategoryId(v); }}>
          <SelectTrigger><SelectValue placeholder="Seleccionar categoría" /></SelectTrigger>
          <SelectContent>
            {(categories ?? []).map((c) => (
              <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="budget-amount">Monto (COP)</Label>
          <MoneyInput id="budget-amount" placeholder="0"
            value={amount} onChange={setAmount} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="budget-month">Mes</Label>
          <Input id="budget-month" type="month" value={month}
            onChange={(e) => setMonth(e.target.value)} required />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="budget-threshold">Umbral de alerta (%)</Label>
        <Input id="budget-threshold" type="number" min="1" max="100"
          value={alertThreshold} onChange={(e) => setAlertThreshold(e.target.value)} />
        <p className="text-xs text-muted-foreground">
          Recibirás una alerta cuando el gasto supere este porcentaje del presupuesto.
        </p>
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Guardando…" : "Crear presupuesto"}
      </Button>
    </form>
  );
}
