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
import { AppSheetFooter } from "@/components/ui/app-sheet";
import { MoneyAmountField } from "./MoneyAmountField";
import { CategorySelect } from "./CategorySelect";
import { toast } from "sonner";
import { toCents, dateStrToTs, parseMoneyInput, formatCents } from "@/lib/money";
import { buildTxConfirmation } from "@/lib/txConfirmation";
import { useAppData } from "@/contexts/app-data";
import { SaveMovementButton, useSaveConfirmation } from "./SaveMovementButton";
import { AddChip, DateChip, ExtrasRow, Reveal } from "./FormExtras";
import { errorMessage } from "@/lib/errorMessage";
import { selectableCategories } from "@/lib/categories";

const FORM_ID = "tx-card-form";

interface CardPurchaseFieldsProps {
  card: Doc<"cards">;
  // Estado compartido controlado por el padre (TransactionForm)
  amount: string;
  description: string;
  date: string;
  onAmountChange: (v: string) => void;
  onDescChange: (v: string) => void;
  onDateChange: (v: string) => void;
  onSuccess?: () => void;
}

export function CardPurchaseFields({
  card,
  amount,
  description,
  date,
  onAmountChange,
  onDescChange,
  onDateChange,
  onSuccess,
}: CardPurchaseFieldsProps) {
  const { categories } = useAppData();
  const createPurchase = useMutation(api.cardPurchases.createPurchase);

  const [categoryId, setCategoryId]           = useState("");
  const [installments, setInstallments]       = useState("1");
  const [hasInterest, setHasInterest]         = useState(false);
  const [interestRatePct, setInterestRatePct] = useState("");
  const [notes, setNotes]                     = useState("");
  const [loading, setLoading]                 = useState(false);
  const [fieldErrors, setFieldErrors]         = useState<Record<string, string>>({});
  const { phase, confirm } = useSaveConfirmation(onSuccess);
  const [showNotes, setShowNotes] = useState(false);

  // Las compras con tarjeta siempre son de tipo "gasto"
  const filteredCategories = selectableCategories(categories ?? [], "gasto");

  const amountPreview = parseMoneyInput(amount);
  const saveLabel = amountPreview > 0
    ? `Guardar \u2212${formatCents(toCents(amountPreview), card.currency)}`
    : "Registrar compra";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountNum = parseMoneyInput(amount);
    const nInstallments = parseInt(installments) || 1;
    const rate = hasInterest ? (parseFloat(interestRatePct) || 0) / 100 : 0;

    const errors: Record<string, string> = {};
    if (!amountNum || amountNum <= 0) errors.amount = "El monto debe ser mayor que cero";
    if (!description.trim()) errors.description = "La descripción es obligatoria";
    if (nInstallments < 1) errors.installments = "Debe ser al menos 1 cuota";
    if (hasInterest && rate <= 0) errors.interest = "Ingresa la tasa de interés";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    setLoading(true);
    try {
      await createPurchase({
        cardId: card._id,
        categoryId: categoryId ? (categoryId as Id<"categories">) : undefined,
        description: description.trim(),
        totalAmount: toCents(amountNum),
        totalInstallments: nInstallments,
        hasInterest,
        interestRate: hasInterest ? rate : undefined,
        // Las fechas de las cuotas las calcula el backend desde el corte de la tarjeta
        purchaseDate: dateStrToTs(date),
        // `createPurchase` acepta notas y el formulario de edición ya las tenía
        notes: notes.trim() || undefined,
      });
      // En vez de un toast, el botón se vuelve la confirmación y la hoja se cierra sola
      confirm(buildTxConfirmation({
        kind: "compra_tarjeta",
        amountCents: toCents(amountNum),
        currency: card.currency,
        description,
        cardName: card.name,
        installments: nInstallments,
      }));
    } catch (err) {
      toast.error(errorMessage(err, "Error al registrar compra"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">

      {/* ── Monto ─────────────────────────────────────────────────────────── */}
      <MoneyAmountField
        id="tx-amount"
        label={<>Monto ({card.currency}) <span aria-hidden="true" className="text-danger">*</span></>}
        value={amount}
        onChange={(v) => {
          onAmountChange(v);
          if (fieldErrors.amount) setFieldErrors((fe) => ({ ...fe, amount: "" }));
        }}
        ringColor="var(--os-magenta)"
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

      {/* ── Campos de tarjeta de crédito ─────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="tx-installments" className="mb-2 block px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Cuotas <span aria-hidden="true" className="text-danger">*</span>
          </Label>
          <Input
            id="tx-installments"
            type="number"
            inputMode="numeric"
            min="1"
            max="60"
            value={installments}
            onChange={(e) => {
              setInstallments(e.target.value);
              if (fieldErrors.installments) setFieldErrors((fe) => ({ ...fe, installments: "" }));
            }}
            required
            aria-required="true"
            aria-invalid={!!fieldErrors.installments}
            aria-describedby={fieldErrors.installments ? "tx-installments-error" : undefined}
            style={{ background: "var(--surface-2)" }}
          />
          {fieldErrors.installments && (
            <p id="tx-installments-error" role="alert" className="text-xs text-destructive mt-1">
              {fieldErrors.installments}
            </p>
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
              onCheckedChange={(v) => {
                setHasInterest(v);
                if (!v) {
                  setInterestRatePct("");
                } else if (card.interestRate) {
                  // Pre-llenar con la tasa configurada en la tarjeta
                  setInterestRatePct((card.interestRate * 100).toFixed(2));
                }
              }}
              aria-label="Aplicar interés"
            />
          </div>
        </div>
      </div>

      {hasInterest && (
        <div>
          <Label htmlFor="tx-interest" className="mb-2 block px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Tasa mensual % <span className="text-muted-foreground font-normal">(m.v.)</span>{" "}
            <span aria-hidden="true" className="text-danger">*</span>
          </Label>
          <DecimalInput
            id="tx-interest"
            maxDecimals={3}
            min={0.001}
            max={100}
            placeholder={card.interestRate ? (card.interestRate * 100).toFixed(2).replace(".", ",") : "Ej: 2,5"}
            value={interestRatePct}
            onChange={(v) => {
              setInterestRatePct(v);
              if (fieldErrors.interest) setFieldErrors((fe) => ({ ...fe, interest: "" }));
            }}
            required
            aria-required="true"
            aria-invalid={!!fieldErrors.interest}
            aria-describedby={fieldErrors.interest ? "tx-interest-error" : undefined}
            style={{ background: "var(--surface-2)" }}
          />
          {fieldErrors.interest && (
            <p id="tx-interest-error" role="alert" className="text-xs text-destructive mt-1.5">
              {fieldErrors.interest}
            </p>
          )}
        </div>
      )}

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

      {/* ── Lo opcional, plegado (ver FormExtras) ────────────────────────────── */}
      <ExtrasRow>
        <DateChip id="tx-date" value={date} onChange={onDateChange} />
        {!showNotes && <AddChip label="Nota" onClick={() => setShowNotes(true)} />}
      </ExtrasRow>

      {/* ── Nota ──────────────────────────────────────────────────────────── */}
      <Reveal show={showNotes}>
        <div>
          <Label htmlFor="cpf-notes" className="mb-2 block px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Nota
          </Label>
          <Textarea
            id="cpf-notes"
            rows={2}
            autoFocus
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            placeholder="Opcional"
            style={{ background: "var(--surface-2)" }}
          />
        </div>
      </Reveal>

      {/* ── Guardar, en el pie fijo de la hoja (fuera del <form>) ─────────── */}
      <AppSheetFooter>
        <div data-tx-footer>
          <SaveMovementButton form={FORM_ID} className="" loading={loading} phase={phase} label={saveLabel} />
        </div>
      </AppSheetFooter>

    </form>
  );
}
