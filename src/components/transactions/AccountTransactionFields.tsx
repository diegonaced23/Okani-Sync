"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { MoneyAmountField } from "./MoneyAmountField";
import { CategorySelect } from "./CategorySelect";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import { toast } from "sonner";
import { toCents, dateStrToTs, parseMoneyInput } from "@/lib/money";
import { Check, Loader2, PiggyBank } from "lucide-react";
import { useAppData } from "@/contexts/app-data";

type TxType = "ingreso" | "gasto";

interface AccountTransactionFieldsProps {
  type: TxType;
  // Estado compartido controlado por el padre (TransactionForm)
  amount: string;
  description: string;
  date: string;
  onAmountChange: (v: string) => void;
  onDescChange: (v: string) => void;
  onDateChange: (v: string) => void;
  // ID de la cuenta seleccionada (puede ser undefined si el usuario no eligió ninguna)
  accountId: Id<"accounts"> | undefined;
  currency: string;
  onSuccess?: () => void;
}

export function AccountTransactionFields({
  type,
  amount,
  description,
  date,
  onAmountChange,
  onDescChange,
  onDateChange,
  accountId,
  currency,
  onSuccess,
}: AccountTransactionFieldsProps) {
  const { categories, goals } = useAppData();
  const createTransaction = useMutation(api.transactions.create);

  const [categoryId, setCategoryId]   = useState("");
  const [goalId, setGoalId]           = useState("");
  const [notes, setNotes]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const filteredCategories = (categories ?? []).filter(
    (c) => c.type === type || c.type === "ambos"
  );
  // Metas activas sin cuenta vinculada (disponibles para asociar a un gasto)
  const availableGoals = (goals ?? []).filter(
    (g) => g.status === "activa" && !g.linkedAccountId
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountNum = parseMoneyInput(amount);

    // Validación inline para feedback inmediato
    const errors: Record<string, string> = {};
    if (!accountId) errors.source = type === "ingreso" ? "Selecciona una cuenta destino" : "Selecciona una cuenta o tarjeta de origen";
    if (!amountNum || amountNum <= 0) errors.amount = "El monto debe ser mayor que cero";
    if (!description.trim()) errors.description = "La descripción es obligatoria";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    setLoading(true);
    try {
      await createTransaction({
        type,
        amount: toCents(amountNum),
        description: description.trim(),
        date: dateStrToTs(date),
        currency,
        accountId,
        categoryId: categoryId ? (categoryId as Id<"categories">) : undefined,
        goalId: type === "gasto" && goalId ? (goalId as Id<"goals">) : undefined,
        // `create` acepta notas desde siempre; solo faltaba el campo
        notes: notes.trim() || undefined,
      });
      toast.success(type === "ingreso" ? "Ingreso registrado" : "Gasto registrado");
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* Advertencia: sin cuenta/tarjeta de origen seleccionada (evita registros huérfanos).
          Se oculta apenas se elige una fuente, sin depender de un efecto. */}
      {fieldErrors.source && !accountId && (
        <p role="alert" className="text-xs text-destructive -mb-1">
          {fieldErrors.source}
        </p>
      )}

      {/* ── Monto ─────────────────────────────────────────────────────────── */}
      <MoneyAmountField
        id="tx-amount"
        label={<>Monto ({currency}) <span aria-hidden="true" className="text-danger">*</span></>}
        value={amount}
        onChange={(v) => {
          onAmountChange(v);
          if (fieldErrors.amount) setFieldErrors((fe) => ({ ...fe, amount: "" }));
        }}
        ringColor={type === "ingreso" ? "var(--os-lime)" : "var(--os-magenta)"}
        error={fieldErrors.amount}
      />

      {/* ── Descripción ───────────────────────────────────────────────────── */}
      <div>
        <Label htmlFor="tx-desc" className="mb-2 block px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          Descripción <span aria-hidden="true" className="text-danger">*</span>
        </Label>
        <Input
          id="tx-desc"
          placeholder="Ej: Cena con amigos"
          value={description}
          onChange={(e) => {
            onDescChange(e.target.value);
            if (fieldErrors.description) setFieldErrors((fe) => ({ ...fe, description: "" }));
          }}
          required
          aria-required="true"
          aria-invalid={!!fieldErrors.description}
          aria-describedby={fieldErrors.description ? "tx-desc-error" : undefined}
          style={{ background: "var(--surface-2)" }}
        />
        {fieldErrors.description && (
          <p id="tx-desc-error" role="alert" className="text-xs text-destructive mt-1.5">
            {fieldErrors.description}
          </p>
        )}
      </div>

      {/* ── Fecha ─────────────────────────────────────────────────────────── */}
      <div>
        <Label htmlFor="tx-date" className="mb-2 block px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          Fecha
        </Label>
        <DatePicker id="tx-date" value={date} onChange={onDateChange} required style={{ background: "var(--surface-2)" }} />
      </div>

      {/* ── Categoría ─────────────────────────────────────────────────────── */}
      {filteredCategories.length > 0 && (
        <div>
          <span className="mb-2 block px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Categoría
          </span>
          <CategorySelect
            id="tx-category"
            value={categoryId}
            onValueChange={setCategoryId}
            categories={filteredCategories}
          />
        </div>
      )}

      {/* ── Meta de ahorro (solo gastos desde cuenta, no tarjeta) ──────────── */}
      {type === "gasto" && availableGoals.length > 0 && (
        <div>
          <Label htmlFor="tx-goal" className="text-[12px] font-semibold text-foreground mb-2 flex items-center gap-1.5">
            <PiggyBank className="h-3.5 w-3.5" style={{ color: "var(--os-cyan)" }} />
            Ahorrar para (opcional)
          </Label>
          <Select value={goalId} onValueChange={(v) => setGoalId(v ?? "")}>
            <SelectTrigger id="tx-goal" className="w-full" style={{ background: "var(--surface-2)" }}>
              {goalId ? (
                <span className="text-sm truncate">
                  {availableGoals.find((g) => g._id === goalId)?.icon}{" "}
                  {availableGoals.find((g) => g._id === goalId)?.name}
                </span>
              ) : (
                <span className="text-muted-foreground">Sin meta</span>
              )}
            </SelectTrigger>
            <SelectContent side="bottom" alignItemWithTrigger={false} className="max-h-[30vh]">
              <SelectItem value="">Sin meta</SelectItem>
              {availableGoals.map((g) => (
                <SelectItem key={g._id} value={g._id}>
                  {g.icon} {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {goalId && (
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Este gasto se contará como ahorro y se sumará al progreso de la meta.
            </p>
          )}
        </div>
      )}

      {/* ── Nota ──────────────────────────────────────────────────────────── */}
      <div>
        <Label htmlFor="tx-notes" className="mb-2 block px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          Nota
        </Label>
        <Textarea
          id="tx-notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          placeholder="Opcional"
          style={{ background: "var(--surface-2)" }}
        />
      </div>

      {/* ── Botón guardar ─────────────────────────────────────────────────── */}
      <button
        type="submit"
        disabled={loading}
        className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-gradient-to-r from-emerald-400 to-teal-500 text-[15px] font-bold text-white shadow-[0_10px_24px_-10px_rgb(16_185_129/0.8)] transition-transform active:scale-[0.98] disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" strokeWidth={2.5} />}
        {loading ? "Guardando…" : "Guardar movimiento"}
      </button>

    </form>
  );
}
