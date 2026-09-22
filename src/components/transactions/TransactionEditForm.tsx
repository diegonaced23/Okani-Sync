"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { MoneyAmountField } from "./MoneyAmountField";
import { AccountCardSelect } from "./AccountCardSelect";
import { CategorySelect } from "./CategorySelect";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { fromCents, toCents, dateStrToTs, tsToDateStr, parseMoneyInput } from "@/lib/money";
import { X } from "lucide-react";
import { buildEditConfirmation } from "@/lib/txConfirmation";
import { useAppData } from "@/contexts/app-data";
import { SaveMovementButton, useSaveConfirmation } from "./SaveMovementButton";
import { errorMessage } from "@/lib/errorMessage";
import { selectableCategories } from "@/lib/categories";

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
  const [notes, setNotes]           = useState(tx.notes ?? "");
  const [loading, setLoading]       = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const { phase, confirm } = useSaveConfirmation(onSuccess);

  // Los gastos con tarjeta vinculados a una cuota solo permiten editar
  // descripción y categoría — el backend rechaza cualquier otro campo (ver convex/transactions.ts).
  const isLockedCardExpense = tx.type === "gasto_tarjeta" && tx.cardInstallmentId != null;
  // El interés de una cuota lo calcula la app: se puede ajustar al monto del extracto
  const isInterestCharge = isLockedCardExpense && tx.cardChargeKind === "interes";

  const [sourceKind, sourceRawId] = sourceId.includes(":") ? sourceId.split(":") : ["", ""];

  // Solo mostrar categorías que correspondan al tipo de la transacción
  const filteredCategories = selectableCategories(categories ?? [], tx.type, tx.categoryId);

  async function handleSave() {
    // Validación inline para feedback inmediato (en vez de solo un toast transitorio)
    const errors: Record<string, string> = {};
    if (!desc.trim()) errors.description = "La descripción es obligatoria";

    const needsAmountValidation = tx.type !== "transferencia" && (!isLockedCardExpense || isInterestCharge);
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
        // El backend propaga descripción y notas a la otra pierna de la transferencia
        await updateTx({
          transactionId: tx._id,
          description: desc.trim(),
          notes: notes.trim() || undefined,
          clearNotes: !!tx.notes && !notes.trim(),
        });
        confirm(buildEditConfirmation({ type: tx.type, amountCents: tx.amount, currency: tx.currency, description: desc }));
      } catch (err) {
        toast.error(errorMessage(err, "Error al actualizar"));
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
        const newAmount = isInterestCharge ? toCents(amountNum) : tx.amount;
        await updateTx({
          transactionId: tx._id,
          description: desc.trim(),
          ...(isInterestCharge && newAmount !== tx.amount ? { amount: newAmount } : {}),
        });
        confirm(buildEditConfirmation({ type: tx.type, amountCents: newAmount, currency: tx.currency, description: desc }));
      } catch (err) {
        toast.error(errorMessage(err, "Error al actualizar"));
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
        // Sin `clearCategory`, mandar categoryId undefined no borraba nada: el patch
        // interpreta «sin valor» como «no tocar», y el toast decía que sí se guardó.
        categoryId:  categoryId ? (categoryId as Id<"categories">) : undefined,
        clearCategory: !categoryId,
        // `|| undefined` + clearNotes: mandar "" guardaría una cadena vacía en cada
        // guardado de un movimiento que nunca tuvo nota
        notes: notes.trim() || undefined,
        clearNotes: !!tx.notes && !notes.trim(),
        accountId:   sourceKind === "account" && sourceRawId ? (sourceRawId as Id<"accounts">) : undefined,
        cardId:      sourceKind === "card"    && sourceRawId ? (sourceRawId as Id<"cards">)    : undefined,
      });
      confirm(buildEditConfirmation({ type: tx.type, amountCents: toCents(amountNum), currency: tx.currency, description: desc }));
    } catch (err) {
      toast.error(errorMessage(err, "Error al actualizar"));
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
          {isInterestCharge
            ? "Es el interés que la app calculó para esta cuota. Si tu extracto dice otra cifra, escríbela aquí: la deuda de la tarjeta se ajusta con la diferencia."
            : "Aquí solo puedes editar la descripción. Para cambiar la categoría, el monto, la fecha o la tarjeta, edita la compra directamente."}
        </div>
      )}

      {/* Monto — oculto para transferencias y gasto_tarjeta con cuota */}
      {tx.type !== "transferencia" && (!isLockedCardExpense || isInterestCharge) && (
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
          <span className="mb-2 block px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            {tx.type === "ingreso" ? "Cuenta destino" : "Cuenta"}
          </span>
          <AccountCardSelect
            id="edit-source"
            ariaLabel={tx.type === "ingreso" ? "Cuenta destino" : "Cuenta"}
            value={sourceId}
            onValueChange={(v) => setSourceId(v ?? "")}
            accounts={accountList}
            cards={cardList}
            // Sin tarjetas: un gasto con tarjeta de crédito se registra como compra a
            // cuotas (lo exige `transactions.create`), así que moverlo aquí creaba un
            // cargo sin cuota detrás y subía la deuda sin respaldo.
            showCards={false}
          />
        </div>
      )}

      {/* Descripción */}
      <div>
        <Label htmlFor="edit-desc" className="mb-2 block px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
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
          <Label htmlFor="edit-date" className="mb-2 block px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Fecha
          </Label>
          <DatePicker id="edit-date" value={date} onChange={setDate} required style={{ background: "var(--surface-2)" }} />
        </div>
      )}

      {/* Categoría — oculta para transferencias y gasto_tarjeta con cuota */}
      {tx.type !== "transferencia" && !isLockedCardExpense && filteredCategories.length > 0 && (
        <div>
          <span className="mb-2 block px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Categoría
          </span>
          <CategorySelect
            id="edit-category"
            value={categoryId}
            onValueChange={setCategoryId}
            categories={filteredCategories}
          />
        </div>
      )}

      {/* Notas — el backend las soporta desde siempre; solo faltaba el campo */}
      {!isLockedCardExpense && (
        <div>
          <Label htmlFor="edit-notes" className="mb-2 block px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Nota
          </Label>
          <Textarea
            id="edit-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            placeholder="Opcional"
            style={{ background: "var(--surface-2)" }}
          />
        </div>
      )}

      {/* Guardar / Cancelar */}
      <SaveMovementButton
        type="button"
        onClick={handleSave}
        loading={loading}
        phase={phase}
        label="Guardar cambios"
        secondary={
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={loading}
            className="h-12 gap-1.5"
          >
            <X className="h-4 w-4" />
            Cancelar
          </Button>
        }
      />

    </div>
  );
}
