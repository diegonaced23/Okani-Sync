"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DatePicker } from "@/components/ui/date-picker";
import { MoneyInput } from "@/components/ui/money-input";
import { CategorySelect } from "./CategorySelect";
import { toast } from "sonner";
import { toCents, dateStrToTs } from "@/lib/money";
import { Check } from "lucide-react";
import { useAppData } from "@/contexts/app-data";

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
  const [loading, setLoading]                 = useState(false);
  const [fieldErrors, setFieldErrors]         = useState<Record<string, string>>({});

  // Las compras con tarjeta siempre son de tipo "gasto"
  const filteredCategories = (categories ?? []).filter(
    (c) => c.type === "gasto" || c.type === "ambos"
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountNum = parseFloat(amount.replace(/[^0-9.]/g, ""));
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

    // Primera cuota: un mes después de la fecha de compra (mediodía local para evitar desfase UTC)
    const firstInstallmentDate = new Date(date + "T12:00:00");
    firstInstallmentDate.setMonth(firstInstallmentDate.getMonth() + 1);

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
        purchaseDate: dateStrToTs(date),
        firstInstallmentDate: firstInstallmentDate.getTime(),
      });
      toast.success("Compra registrada y cronograma generado");
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al registrar compra");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* ── Monto ─────────────────────────────────────────────────────────── */}
      <div>
        <Label htmlFor="tx-amount" className="text-[12px] font-semibold text-foreground mb-2 block">
          Monto <span aria-hidden="true" className="text-danger">*</span>
        </Label>
        <div
          className="flex items-center justify-center rounded-xl focus-within:ring-2 focus-within:ring-ring"
          style={{
            background: "var(--surface-2)",
            padding: "18px 16px",
            "--ring": "var(--os-magenta)",
          } as React.CSSProperties}
        >
          <MoneyInput
            id="tx-amount"
            value={amount}
            onChange={(v) => {
              onAmountChange(v);
              if (fieldErrors.amount) setFieldErrors((fe) => ({ ...fe, amount: "" }));
            }}
            placeholder="0"
            required
            aria-required="true"
            aria-invalid={!!fieldErrors.amount}
            aria-describedby={fieldErrors.amount ? "tx-amount-error" : undefined}
            className="text-center border-none bg-transparent shadow-none focus-visible:ring-0 font-mono-num p-0 h-auto"
            style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.025em" }}
          />
        </div>
        {fieldErrors.amount && (
          <p id="tx-amount-error" role="alert" className="text-xs text-destructive mt-1.5">
            {fieldErrors.amount}
          </p>
        )}
      </div>

      {/* ── Descripción ───────────────────────────────────────────────────── */}
      <div>
        <Label htmlFor="tx-desc" className="text-[12px] font-semibold text-foreground mb-2 block">
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
          <Label htmlFor="tx-installments" className="text-[12px] font-semibold text-foreground mb-2 block">
            Cuotas <span aria-hidden="true" className="text-danger">*</span>
          </Label>
          <Input
            id="tx-installments"
            type="number"
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
          <Label htmlFor="tx-interest" className="text-[12px] font-semibold text-foreground mb-2 block">
            Tasa mensual % <span className="text-muted-foreground font-normal">(m.v.)</span>{" "}
            <span aria-hidden="true" className="text-danger">*</span>
          </Label>
          <Input
            id="tx-interest"
            type="number"
            min="0.001"
            max="100"
            step="0.001"
            placeholder={card.interestRate ? (card.interestRate * 100).toFixed(2) : "Ej: 2.5"}
            value={interestRatePct}
            onChange={(e) => {
              setInterestRatePct(e.target.value);
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

      {/* ── Fecha ─────────────────────────────────────────────────────────── */}
      <div>
        <Label htmlFor="tx-date" className="text-[12px] font-semibold text-foreground mb-2 block">
          Fecha de compra
        </Label>
        <DatePicker id="tx-date" value={date} onChange={onDateChange} required style={{ background: "var(--surface-2)" }} />
      </div>

      {/* ── Categoría ─────────────────────────────────────────────────────── */}
      {filteredCategories.length > 0 && (
        <div>
          <Label htmlFor="tx-category" className="text-[12px] font-semibold text-foreground mb-2 block">
            Categoría
          </Label>
          <CategorySelect
            id="tx-category"
            value={categoryId}
            onValueChange={setCategoryId}
            categories={filteredCategories}
          />
        </div>
      )}

      {/* ── Botón guardar ─────────────────────────────────────────────────── */}
      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 rounded-xl font-bold transition-all active:scale-[0.98] disabled:opacity-60 mt-2"
        style={{
          padding: "15px 18px",
          fontSize: 15,
          background: "linear-gradient(135deg, var(--os-lime), var(--os-cyan))",
          color: "var(--primary-foreground)",
          border: "none",
          cursor: loading ? "not-allowed" : "pointer",
          boxShadow: "0 8px 20px -6px color-mix(in oklch, var(--os-lime) 55%, transparent)",
        }}
      >
        <Check className="h-4 w-4" strokeWidth={2.5} />
        {loading ? "Guardando…" : "Registrar compra"}
      </button>

    </form>
  );
}
