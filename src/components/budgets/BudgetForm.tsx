"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import { toast } from "sonner";
import { toCents, fromCents, currentMonth } from "@/lib/money";

interface EditBudget {
  _id: string;
  categoryId: string;
  categoryName?: string;
  amount: number;
  alertThreshold?: number;
  notes?: string;
  recurring?: boolean;
}

interface BudgetFormProps {
  defaultMonth?: string;
  editBudget?: EditBudget;
  onSuccess?: () => void;
}

export function BudgetForm({ defaultMonth, editBudget, onSuccess }: BudgetFormProps) {
  const isEdit = !!editBudget;

  const createBudget = useMutation(api.budgets.create);
  const updateBudget = useMutation(api.budgets.update);
  const categories = useQuery(api.categories.list, isEdit ? "skip" : { type: "gasto" });

  const [categoryId, setCategoryId] = useState(editBudget?.categoryId ?? "");
  const [amount, setAmount] = useState(
    isEdit ? String(fromCents(editBudget!.amount)) : ""
  );
  const [alertThreshold, setAlertThreshold] = useState(
    String(editBudget?.alertThreshold ?? 80)
  );
  const [recurring, setRecurring] = useState(editBudget?.recurring ?? false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountNum = parseFloat(amount) || 0;
    if (amountNum <= 0) {
      toast.error("El monto debe ser mayor que cero");
      return;
    }

    setLoading(true);
    try {
      if (isEdit) {
        await updateBudget({
          budgetId: editBudget!._id as Id<"budgets">,
          amount: toCents(amountNum),
          alertThreshold: parseInt(alertThreshold) || 80,
          recurring,
        });
        toast.success("Presupuesto actualizado");
      } else {
        if (!categoryId) {
          toast.error("Selecciona una categoría");
          setLoading(false);
          return;
        }
        await createBudget({
          categoryId: categoryId as Id<"categories">,
          amount: toCents(amountNum),
          currency: "COP",
          month: defaultMonth ?? currentMonth(),
          alertThreshold: parseInt(alertThreshold) || 80,
          recurring,
        });
        toast.success("Presupuesto creado");
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
        <Label>Categoría</Label>
        {isEdit ? (
          <p className="text-sm font-medium px-3 py-2 rounded-md bg-muted text-foreground">
            {editBudget!.categoryName ?? "Sin categoría"}
          </p>
        ) : (
          <Select value={categoryId} onValueChange={(v) => { if (v) setCategoryId(v); }}>
            <SelectTrigger>
              <span className="flex-1 text-left text-sm truncate">
                {categoryId
                  ? (categories ?? []).find(c => c._id === categoryId)?.name ?? "Categoría"
                  : <span className="text-muted-foreground">Seleccionar categoría</span>}
              </span>
            </SelectTrigger>
            <SelectContent>
              {(categories ?? []).map((c) => (
                <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="budget-amount">Monto mensual (COP) <span aria-hidden="true" className="text-danger">*</span></Label>
        <MoneyInput id="budget-amount" placeholder="0"
          value={amount} onChange={setAmount} required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="budget-threshold">Umbral de alerta (%)</Label>
        <Input id="budget-threshold" type="number" min="1" max="100"
          value={alertThreshold} onChange={(e) => setAlertThreshold(e.target.value)} />
        <p className="text-xs text-muted-foreground">
          Recibirás una alerta cuando el gasto supere este porcentaje del presupuesto.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border px-3 py-3">
        <div className="space-y-0.5">
          <Label htmlFor="budget-recurring" className="text-sm font-medium cursor-pointer">
            Repetir cada mes
          </Label>
          <p className="text-xs text-muted-foreground">
            Se renovará automáticamente el 1° de cada mes.
          </p>
        </div>
        <Switch
          id="budget-recurring"
          checked={recurring}
          onCheckedChange={setRecurring}
        />
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear presupuesto"}
      </Button>
    </form>
  );
}
