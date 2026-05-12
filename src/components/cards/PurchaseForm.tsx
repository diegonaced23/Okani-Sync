"use client";

import { useState, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MoneyInput } from "@/components/ui/money-input";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { toCents, fromCents, formatCents, calculateInstallment } from "@/lib/money";

interface PurchaseFormProps {
  cardId: Id<"cards">;
  defaultInterestRate?: number;
  currency: string;
  purchase?: Doc<"cardPurchases">;
  onSuccess?: () => void;
}

export function PurchaseForm({
  cardId,
  defaultInterestRate,
  currency,
  purchase,
  onSuccess,
}: PurchaseFormProps) {
  const isEdit = !!purchase;
  const canEditFinancials = isEdit ? purchase.paidInstallments === 0 : true;

  const createPurchase = useMutation(api.cardPurchases.createPurchase);
  const updatePurchase = useMutation(api.cardPurchases.updatePurchase);
  const categories = useQuery(api.categories.list, { type: "gasto" });

  const [description, setDescription] = useState(purchase?.description ?? "");
  const [amount, setAmount] = useState(
    purchase ? fromCents(purchase.totalAmount).toString() : ""
  );
  const [installments, setInstallments] = useState(
    purchase ? purchase.totalInstallments.toString() : "1"
  );
  const [hasInterest, setHasInterest] = useState(purchase?.hasInterest ?? false);
  const [interestRatePct, setInterestRatePct] = useState(() => {
    if (purchase?.interestRate) return (purchase.interestRate * 100).toFixed(2);
    if (defaultInterestRate) return (defaultInterestRate * 100).toFixed(2);
    return "";
  });
  const [categoryId, setCategoryId] = useState(purchase?.categoryId ?? "");
  const [purchaseDate, setPurchaseDate] = useState(() => {
    const ts = purchase?.purchaseDate ?? Date.now();
    return new Date(ts).toISOString().substring(0, 10);
  });
  const [notes, setNotes] = useState(purchase?.notes ?? "");
  const [loading, setLoading] = useState(false);

  const amountCents = toCents(parseFloat(amount) || 0);
  const nInstallments = parseInt(installments) || 1;
  const rate = hasInterest ? (parseFloat(interestRatePct) || 0) / 100 : 0;

  const preview = useMemo(() => {
    if (!canEditFinancials || amountCents <= 0 || nInstallments <= 0) return null;
    return calculateInstallment(amountCents, rate, nInstallments);
  }, [canEditFinancials, amountCents, rate, nInstallments]);

  const firstInstallmentDate = useMemo(() => {
    const d = new Date(purchaseDate);
    d.setMonth(d.getMonth() + 1);
    return d.getTime();
  }, [purchaseDate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim() || amountCents <= 0) {
      toast.error("Completa los campos obligatorios");
      return;
    }
    if (canEditFinancials && hasInterest && !rate) {
      toast.error("Ingresa la tasa de interés");
      return;
    }

    setLoading(true);
    try {
      if (isEdit) {
        await updatePurchase({
          purchaseId: purchase._id,
          description: description.trim(),
          clearCategory: !categoryId,
          categoryId: categoryId ? (categoryId as Id<"categories">) : undefined,
          notes: notes || undefined,
          ...(canEditFinancials && {
            totalAmount: amountCents,
            totalInstallments: nInstallments,
            hasInterest,
            interestRate: hasInterest ? rate : undefined,
            purchaseDate: new Date(purchaseDate).getTime(),
            firstInstallmentDate,
          }),
        });
        toast.success("Compra actualizada");
      } else {
        await createPurchase({
          cardId,
          categoryId: categoryId ? (categoryId as Id<"categories">) : undefined,
          description: description.trim(),
          totalAmount: amountCents,
          totalInstallments: nInstallments,
          hasInterest,
          interestRate: hasInterest ? rate : undefined,
          purchaseDate: new Date(purchaseDate).getTime(),
          firstInstallmentDate,
          notes: notes || undefined,
        });
        toast.success("Compra registrada y cronograma generado");
      }
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {isEdit && !canEditFinancials && (
        <div className="rounded-lg bg-muted/50 border border-border p-3 text-sm text-muted-foreground">
          Esta compra tiene {purchase.paidInstallments} cuota{purchase.paidInstallments !== 1 ? "s" : ""} pagada{purchase.paidInstallments !== 1 ? "s" : ""}. Solo puedes editar la descripción, categoría y notas.
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="pu-desc">Descripción</Label>
        <Input
          id="pu-desc"
          placeholder="Ej: iPhone 16, Nevera Samsung…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="pu-amount">Monto ({currency})</Label>
          <MoneyInput
            id="pu-amount"
            placeholder="0"
            value={amount}
            onChange={setAmount}
            required
            disabled={!canEditFinancials}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pu-inst">Número de cuotas</Label>
          <Input
            id="pu-inst"
            type="number"
            min="1"
            max="60"
            value={installments}
            onChange={(e) => setInstallments(e.target.value)}
            disabled={!canEditFinancials}
          />
        </div>
      </div>

      <div className={`flex items-center justify-between rounded-lg border border-border p-3 ${!canEditFinancials ? "opacity-50" : ""}`}>
        <div>
          <p className="text-sm font-medium text-foreground">¿Genera intereses?</p>
          <p className="text-xs text-muted-foreground">Activa para calcular con interés compuesto</p>
        </div>
        <Switch
          checked={hasInterest}
          onCheckedChange={setHasInterest}
          disabled={!canEditFinancials}
        />
      </div>

      {hasInterest && (
        <div className="space-y-1.5">
          <Label htmlFor="pu-rate">Tasa mensual % (m.v.)</Label>
          <Input
            id="pu-rate"
            type="number"
            min="0.001"
            max="100"
            step="0.001"
            placeholder="Ej: 2.5"
            value={interestRatePct}
            onChange={(e) => setInterestRatePct(e.target.value)}
            required
            disabled={!canEditFinancials}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Categoría (opcional)</Label>
          <Select value={categoryId} onValueChange={(v) => setCategoryId(v ?? "")}>
            <SelectTrigger>
              <span className="flex-1 text-left text-sm truncate">
                {categoryId
                  ? (categories ?? []).find((c) => c._id === categoryId)?.name ?? "Categoría"
                  : <span className="text-muted-foreground">Sin categoría</span>}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Sin categoría</SelectItem>
              {(categories ?? []).map((c) => (
                <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pu-date">Fecha de compra</Label>
          {canEditFinancials ? (
            <DatePicker id="pu-date" value={purchaseDate} onChange={setPurchaseDate} required />
          ) : (
            <Input
              id="pu-date"
              type="date"
              value={purchaseDate}
              disabled
              className="opacity-50"
            />
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pu-notes">Notas (opcional)</Label>
        <Input
          id="pu-notes"
          placeholder="Notas adicionales…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {preview && amountCents > 0 && (
        <>
          <Separator />
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Preview del cronograma
            </p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-muted/50 p-2">
                <p className="text-[10px] text-muted-foreground">Cuota mensual</p>
                <p className="text-sm font-bold text-foreground">
                  {formatCents(preview.amountPerInstallment, currency)}
                </p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2">
                <p className="text-[10px] text-muted-foreground">Total a pagar</p>
                <p className="text-sm font-bold text-foreground">
                  {formatCents(preview.totalWithInterest, currency)}
                </p>
              </div>
              <div className="rounded-lg bg-warning/10 p-2">
                <p className="text-[10px] text-muted-foreground">Total interés</p>
                <p className="text-sm font-bold text-warning">
                  {formatCents(preview.totalInterest, currency)}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-border overflow-hidden text-xs">
              <div className="grid grid-cols-4 px-3 py-1.5 bg-muted/50 text-muted-foreground font-medium">
                <span>#</span><span>Capital</span><span>Interés</span><span className="text-right">Cuota</span>
              </div>
              {preview.schedule.slice(0, 6).map((s) => {
                const dueTs = new Date(purchaseDate);
                dueTs.setMonth(dueTs.getMonth() + s.installmentNumber);
                return (
                  <div key={s.installmentNumber} className="grid grid-cols-4 px-3 py-1.5 border-t border-border">
                    <span className="text-muted-foreground">{s.installmentNumber}</span>
                    <span className="text-accent">{formatCents(s.principalAmount, currency)}</span>
                    <span className="text-warning">{formatCents(s.interestAmount, currency)}</span>
                    <span className="text-right font-medium">{formatCents(s.amount, currency)}</span>
                  </div>
                );
              })}
              {preview.schedule.length > 6 && (
                <div className="px-3 py-1.5 border-t border-border text-center text-muted-foreground">
                  + {preview.schedule.length - 6} cuotas más…
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading
          ? (isEdit ? "Guardando…" : "Registrando…")
          : (isEdit ? "Guardar cambios" : "Registrar compra")}
      </Button>
    </form>
  );
}
