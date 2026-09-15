"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { MoneyAmountField } from "./MoneyAmountField";
import { AccountCardSelect } from "./AccountCardSelect";
import { CategorySelect } from "./CategorySelect";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { fromCents, toCents, dateStrToTs, tsToDateStr, parseMoneyInput } from "@/lib/money";
import { Check, Loader2, X } from "lucide-react";
import { useAppData } from "@/contexts/app-data";

interface TransactionEditFormProps {
  tx: Doc<"transactions">;
  onSuccess: () => void;
  onCancel: () => void;
}

export function TransactionEditForm({ tx, onSuccess, onCancel }: TransactionEditFormProps) {
  const { categories, accountList, cardList } = useAppData();
  const updateTx = useMutation(api.transactions.update);

  // Inicializar desde tx; el componente se remonta cada vez que se activa el modo edición,
  // así que no hace falta el patrón prevTx aquí.
  const [desc, setDesc]             = useState(tx.description);
  const [amount, setAmount]         = useState(String(fromCents(tx.amount)));
  const [sourceId, setSourceId]     = useState<string>(
    tx.accountId ? `account:${tx.accountId}` :
    tx.cardId    ? `card:${tx.cardId}`        : ""
  );
  // tsToDateStr usa hora local para evitar el desfase UTC al mostrar la fecha
  const [date, setDate]             = useState(tsToDateStr(tx.date));
  const [categoryId, setCategoryId] = useState(tx.categoryId ?? "");
  const [loading, setLoading]       = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Los gastos con tarjeta vinculados a una cuota solo permiten editar
  // descripción y categoría — el backend rechaza cualquier otro campo (ver convex/transactions.ts).
  const isLockedCardExpense = tx.type === "gasto_tarjeta" && tx.cardInstallmentId != null;

  const [sourceKind, sourceRawId] = sourceId.includes(":") ? sourceId.split(":") : ["", ""];

  // Solo mostrar categorías que correspondan al tipo de la transacción
  const filteredCategories = (categories ?? []).filter(
    (c) => c.type === tx.type || c.type === "ambos"
  );

  async function handleSave() {
    // Validación inline para feedback inmediato (en vez de solo un toast transitorio)
    const errors: Record<string, string> = {};
    if (!desc.trim()) errors.description = "La descripción es obligatoria";

    const needsAmountValidation = tx.type !== "transferencia" && !isLockedCardExpense;
    const amountNum = parseMoneyInput(amount);
    if (needsAmountValidation && (!amountNum || amountNum <= 0)) {
      errors.amount = "El monto debe ser mayor que cero";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    // Transferencias: solo se edita la descripción
    if (tx.type === "transferencia") {
      setLoading(true);
      try {
        await updateTx({ transactionId: tx._id, description: desc.trim() });
        toast.success("Transferencia actualizada");
        onSuccess();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al actualizar");
      } finally {
        setLoading(false);
      }
      return;
    }

    // Gastos con tarjeta vinculados a una cuota: solo se edita la descripción.
    // La categoría se cambia vía la compra (cardPurchases.updatePurchase), que
    // sí mantiene correcto el split de presupuesto principal/interés.
    if (isLockedCardExpense) {
      setLoading(true);
      try {
        await updateTx({ transactionId: tx._id, description: desc.trim() });
        toast.success("Movimiento actualizado");
        onSuccess();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al actualizar");
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      await updateTx({
        transactionId: tx._id,
        amount:      toCents(amountNum),
        description: desc.trim(),
        date:        dateStrToTs(date),
        categoryId:  categoryId ? (categoryId as Id<"categories">) : undefined,
        accountId:   sourceKind === "account" && sourceRawId ? (sourceRawId as Id<"accounts">) : undefined,
        cardId:      sourceKind === "card"    && sourceRawId ? (sourceRawId as Id<"cards">)    : undefined,
      });
      toast.success("Movimiento actualizado");
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">

      {/* Advertencia para transferencias: solo descripción es editable */}
      {tx.type === "transferencia" && (
        <div
          className="rounded-xl p-3 text-xs text-muted-foreground"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        >
          Las cuentas, el monto y la fecha no se pueden modificar. Elimina y recrea la transferencia si hay errores en los datos principales.
        </div>
      )}

      {/* Advertencia para gasto_tarjeta vinculado a cuota: solo descripción y categoría */}
      {isLockedCardExpense && (
        <div
          className="rounded-xl p-3 text-xs text-muted-foreground"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        >
          Aquí solo puedes editar la descripción. Para cambiar la categoría, el monto, la fecha o la tarjeta, edita la compra directamente.
        </div>
      )}

      {/* Monto — oculto para transferencias y gasto_tarjeta con cuota */}
      {tx.type !== "transferencia" && !isLockedCardExpense && (
        <MoneyAmountField
          id="edit-amount"
          label={<>Monto ({tx.currency}) <span aria-hidden="true" className="text-danger">*</span></>}
          value={amount}
          onChange={(v) => {
            setAmount(v);
            if (fieldErrors.amount) setFieldErrors((fe) => ({ ...fe, amount: "" }));
          }}
          ringColor={tx.type === "ingreso" ? "var(--os-lime)" : "var(--os-magenta)"}
          error={fieldErrors.amount}
          fontSize={28}
          padding="14px 16px"
          autoFocus
        />
      )}

      {/* Cuenta o tarjeta — oculto para transferencias y gasto_tarjeta con cuota */}
      {tx.type !== "transferencia" && !isLockedCardExpense && (
        <div>
          <Label htmlFor="edit-source" className="text-[12px] font-semibold text-foreground mb-2 block">
            {tx.type === "ingreso" ? "Cuenta destino" : "Cuenta o tarjeta"}
          </Label>
          <AccountCardSelect
            id="edit-source"
            value={sourceId}
            onValueChange={(v) => setSourceId(v ?? "")}
            accounts={accountList}
            cards={cardList}
            showCards={tx.type === "gasto"}
          />
        </div>
      )}

      {/* Descripción */}
      <div>
        <Label htmlFor="edit-desc" className="text-[12px] font-semibold text-foreground mb-2 block">
          Descripción <span aria-hidden="true" className="text-danger">*</span>
        </Label>
        <Input
          id="edit-desc"
          autoFocus={tx.type === "transferencia" || isLockedCardExpense}
          value={desc}
          onChange={(e) => {
            setDesc(e.target.value);
            if (fieldErrors.description) setFieldErrors((fe) => ({ ...fe, description: "" }));
          }}
          required
          aria-required="true"
          aria-invalid={!!fieldErrors.description}
          aria-describedby={fieldErrors.description ? "edit-desc-error" : undefined}
          style={{ background: "var(--surface-2)" }}
        />
        {fieldErrors.description && (
          <p id="edit-desc-error" role="alert" className="text-xs text-destructive mt-1.5">
            {fieldErrors.description}
          </p>
        )}
      </div>

      {/* Fecha — oculta para transferencias y gasto_tarjeta con cuota */}
      {tx.type !== "transferencia" && !isLockedCardExpense && (
        <div>
          <Label htmlFor="edit-date" className="text-[12px] font-semibold text-foreground mb-2 block">
            Fecha
          </Label>
          <DatePicker id="edit-date" value={date} onChange={setDate} required style={{ background: "var(--surface-2)" }} />
        </div>
      )}

      {/* Categoría — oculta para transferencias y gasto_tarjeta con cuota */}
      {tx.type !== "transferencia" && !isLockedCardExpense && filteredCategories.length > 0 && (
        <div>
          <Label htmlFor="edit-category" className="text-[12px] font-semibold text-foreground mb-2 block">
            Categoría
          </Label>
          <CategorySelect
            id="edit-category"
            value={categoryId}
            onValueChange={setCategoryId}
            categories={filteredCategories}
          />
        </div>
      )}

      {/* Guardar / Cancelar */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl font-bold transition-all active:scale-[0.98] disabled:opacity-60"
          style={{
            padding: "13px 16px",
            fontSize: 14,
            background: "linear-gradient(135deg, var(--os-lime), var(--os-cyan))",
            color: "var(--primary-foreground)",
            border: "none",
            cursor: loading ? "not-allowed" : "pointer",
            boxShadow: "0 6px 16px -4px color-mix(in oklch, var(--os-lime) 55%, transparent)",
          }}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" strokeWidth={2.5} />}
          {loading ? "Guardando…" : "Guardar cambios"}
        </button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={loading}
          className="gap-1.5"
        >
          <X className="h-4 w-4" />
          Cancelar
        </Button>
      </div>

    </div>
  );
}
