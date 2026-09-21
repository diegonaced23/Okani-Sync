"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { DatePicker } from "@/components/ui/date-picker";
import { MoneyAmountField } from "./MoneyAmountField";
import { CategorySelect } from "./CategorySelect";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { addMonthsClamped, fromCents, toCents, dateStrToTs, tsToDateStr, parseMoneyInput } from "@/lib/money";
import { X } from "lucide-react";
import { buildEditConfirmation } from "@/lib/txConfirmation";
import { useAppData } from "@/contexts/app-data";
import { SaveMovementButton, useSaveConfirmation } from "./SaveMovementButton";

interface CardPurchaseEditFormProps {
  purchase: Doc<"cardPurchases">;
  onSuccess: () => void;
  onCancel: () => void;
}

export function CardPurchaseEditForm({ purchase, onSuccess, onCancel }: CardPurchaseEditFormProps) {
  const { categories } = useAppData();
  const updatePurchase = useMutation(api.cardPurchases.updatePurchase);

  // El backend rechaza cambios financieros si ya hay cuotas pagadas (ver cardPurchases.updatePurchase).
  const canEditFinancials = purchase.paidInstallments === 0;

  const [description, setDescription]         = useState(purchase.description);
  const [categoryId, setCategoryId]           = useState(purchase.categoryId ?? "");
  const [notes, setNotes]                     = useState(purchase.notes ?? "");
  const [amount, setAmount]                   = useState(String(fromCents(purchase.totalAmount)));
  const [installments, setInstallments]       = useState(String(purchase.totalInstallments));
  const [hasInterest, setHasInterest]         = useState(purchase.hasInterest);
  const [interestRatePct, setInterestRatePct] = useState(
    purchase.interestRate ? (purchase.interestRate * 100).toFixed(2) : ""
  );
  // El campo muestra la tasa redondeada a dos decimales. Reenviarla sin que nadie la
  // haya tocado difiere de la guardada (0,02567 → 0,0257), el backend lo lee como un
  // cambio financiero y regenera TODAS las cuotas con otros montos. Solo se manda si
  // de verdad se editó, o si se acaba de activar el interés.
  const [rateTouched, setRateTouched] = useState(false);
  const [purchaseDate, setPurchaseDate]       = useState(tsToDateStr(purchase.purchaseDate));
  const [loading, setLoading]                 = useState(false);
  const [fieldErrors, setFieldErrors]         = useState<Record<string, string>>({});
  const { phase, confirm } = useSaveConfirmation(onSuccess);

  const filteredCategories = (categories ?? []).filter(
    (c) => c.type === "gasto" || c.type === "ambos"
  );

  async function handleSave() {
    const errors: Record<string, string> = {};
    if (!description.trim()) errors.description = "La descripción es obligatoria";

    let amountNum = purchase.totalAmount;
    let nInstallments = purchase.totalInstallments;
    let rate = 0;
    if (canEditFinancials) {
      amountNum = parseMoneyInput(amount);
      nInstallments = parseInt(installments) || 0;
      rate = hasInterest ? (parseFloat(interestRatePct) || 0) / 100 : 0;
      // Si el interés ya estaba activo y nadie tocó la tasa, la válida es la guardada
      if (hasInterest && !rateTouched && purchase.hasInterest) rate = purchase.interestRate ?? rate;
      if (!amountNum || amountNum <= 0) errors.amount = "El monto debe ser mayor que cero";
      if (nInstallments < 1) errors.installments = "Debe ser al menos 1 cuota";
      if (hasInterest && rate <= 0) errors.interest = "Ingresa la tasa de interés";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    setLoading(true);
    try {
      // Solo se envían los campos financieros que de verdad cambiaron: el backend
      // trata cualquiera de ellos como motivo para rehacer el cronograma completo.
      const newAmount = toCents(amountNum);
      const newDate = dateStrToTs(purchaseDate);
      const interestToggled = hasInterest !== purchase.hasInterest;

      await updatePurchase({
        purchaseId: purchase._id,
        description: description.trim(),
        categoryId: categoryId ? (categoryId as Id<"categories">) : undefined,
        clearCategory: !!purchase.categoryId && !categoryId,
        notes: notes.trim() || undefined,
        // Vaciar el textarea no borraba la nota: omitir el campo significa «no tocar»
        clearNotes: !!purchase.notes && !notes.trim(),
        ...(canEditFinancials
          ? {
              ...(newAmount !== purchase.totalAmount ? { totalAmount: newAmount } : {}),
              ...(nInstallments !== purchase.totalInstallments
                ? { totalInstallments: nInstallments }
                : {}),
              ...(interestToggled ? { hasInterest } : {}),
              ...((rateTouched || interestToggled) && hasInterest ? { interestRate: rate } : {}),
              ...(newDate !== purchase.purchaseDate
                ? {
                    purchaseDate: newDate,
                    // La primera cuota cae un mes después de la compra, igual que al
                    // crearla. Sin esto, mover la fecha dejaba el cronograma donde estaba.
                    firstInstallmentDate: addMonthsClamped(newDate, 1),
                  }
                : {}),
            }
          : {}),
      });
      confirm(buildEditConfirmation({
        type: "gasto_tarjeta",
        amountCents: canEditFinancials ? newAmount : purchase.totalAmount,
        currency: purchase.currency,
        description,
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">

      {!canEditFinancials && (
        <div
          className="rounded-xl p-3 text-xs text-muted-foreground"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        >
          Ya hay cuotas pagadas: solo puedes editar la descripción, la categoría y las notas.
        </div>
      )}

      {/* Descripción */}
      <div>
        <Label htmlFor="cp-desc" className="text-[12px] font-semibold text-foreground mb-2 block">
          Descripción <span aria-hidden="true" className="text-danger">*</span>
        </Label>
        <Input
          id="cp-desc"
          autoFocus={!canEditFinancials}
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            if (fieldErrors.description) setFieldErrors((fe) => ({ ...fe, description: "" }));
          }}
          required
          aria-required="true"
          aria-invalid={!!fieldErrors.description}
          aria-describedby={fieldErrors.description ? "cp-desc-error" : undefined}
          style={{ background: "var(--surface-2)" }}
        />
        {fieldErrors.description && (
          <p id="cp-desc-error" role="alert" className="text-xs text-destructive mt-1.5">
            {fieldErrors.description}
          </p>
        )}
      </div>

      {/* Monto / cuotas / interés / fecha — solo si no hay cuotas pagadas */}
      {canEditFinancials && (
        <>
          <MoneyAmountField
            id="cp-amount"
            label={<>Monto total ({purchase.currency}) <span aria-hidden="true" className="text-danger">*</span></>}
            value={amount}
            onChange={(v) => { setAmount(v); if (fieldErrors.amount) setFieldErrors((fe) => ({ ...fe, amount: "" })); }}
            ringColor="var(--os-magenta)"
            error={fieldErrors.amount}
            fontSize={28}
            padding="14px 16px"
            autoFocus
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cp-installments" className="text-[12px] font-semibold text-foreground mb-2 block">
                Cuotas <span aria-hidden="true" className="text-danger">*</span>
              </Label>
              <Input
                id="cp-installments"
                type="number"
                inputMode="numeric"
                min="1"
                max="60"
                value={installments}
                onChange={(e) => { setInstallments(e.target.value); if (fieldErrors.installments) setFieldErrors((fe) => ({ ...fe, installments: "" })); }}
                required
                aria-required="true"
                aria-invalid={!!fieldErrors.installments}
                aria-describedby={fieldErrors.installments ? "cp-installments-error" : undefined}
                style={{ background: "var(--surface-2)" }}
              />
              {fieldErrors.installments && (
                <p id="cp-installments-error" role="alert" className="text-xs text-destructive mt-1">{fieldErrors.installments}</p>
              )}
            </div>
            <div className="flex items-end pb-0.5">
              <div
                className="flex items-center justify-between rounded-xl w-full px-3 py-2.5"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
              >
                <span className="text-[12px] font-semibold text-foreground">¿Con interés?</span>
                <Switch
                  checked={hasInterest}
                  onCheckedChange={(v) => { setHasInterest(v); if (!v) setInterestRatePct(""); }}
                  aria-label="Aplicar interés"
                />
              </div>
            </div>
          </div>

          {hasInterest && (
            <div>
              <Label htmlFor="cp-interest" className="text-[12px] font-semibold text-foreground mb-2 block">
                Tasa mensual % <span className="text-muted-foreground font-normal">(m.v.)</span>{" "}
                <span aria-hidden="true" className="text-danger">*</span>
              </Label>
              <DecimalInput
                id="cp-interest"
                maxDecimals={3}
                min={0.001}
                max={100}
                value={interestRatePct}
                onChange={(v) => { setInterestRatePct(v); setRateTouched(true); if (fieldErrors.interest) setFieldErrors((fe) => ({ ...fe, interest: "" })); }}
                required
                aria-required="true"
                aria-invalid={!!fieldErrors.interest}
                aria-describedby={fieldErrors.interest ? "cp-interest-error" : undefined}
                style={{ background: "var(--surface-2)" }}
              />
              {fieldErrors.interest && (
                <p id="cp-interest-error" role="alert" className="text-xs text-destructive mt-1.5">{fieldErrors.interest}</p>
              )}
            </div>
          )}

          <div>
            <Label htmlFor="cp-date" className="text-[12px] font-semibold text-foreground mb-2 block">
              Fecha de compra
            </Label>
            <DatePicker id="cp-date" value={purchaseDate} onChange={setPurchaseDate} required style={{ background: "var(--surface-2)" }} />
          </div>
        </>
      )}

      {/* Categoría */}
      {filteredCategories.length > 0 && (
        <div>
          <span className="mb-2 block px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Categoría
          </span>
          <CategorySelect
            id="cp-category"
            value={categoryId}
            onValueChange={setCategoryId}
            categories={filteredCategories}
          />
        </div>
      )}

      {/* Notas */}
      <div className="space-y-1.5">
        <Label htmlFor="cp-notes">Notas (opcional)</Label>
        <Textarea id="cp-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

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
