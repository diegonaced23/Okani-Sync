"use client";

import { useState, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MoneyInput } from "@/components/ui/money-input";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { toCents, formatCents, calculateInstallment } from "@/lib/money";

interface PurchaseFormProps {
  cardId: Id<"cards">;
  defaultInterestRate?: number; // decimal
  currency: string;
  onSuccess?: () => void;
}

export function PurchaseForm({
  cardId,
  defaultInterestRate,
  currency,
  onSuccess,
}: PurchaseFormProps) {
  const createPurchase = useMutation(api.cardPurchases.createPurchase);
  const categories = useQuery(api.categories.list, { type: "gasto" });

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [installments, setInstallments] = useState("1");
  const [hasInterest, setHasInterest] = useState(false);
  const [interestRatePct, setInterestRatePct] = useState(
    defaultInterestRate ? (defaultInterestRate * 100).toFixed(2) : ""
  );
  const [categoryId, setCategoryId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(
    () => new Date().toISOString().substring(0, 10)
  );
  const [loading, setLoading] = useState(false);

  const amountCents = toCents(parseFloat(amount) || 0);
  const nInstallments = parseInt(installments) || 1;
  const rate = hasInterest ? (parseFloat(interestRatePct) || 0) / 100 : 0;

  // Preview en tiempo real
  const preview = useMemo(() => {
    if (amountCents <= 0 || nInstallments <= 0) return null;
    return calculateInstallment(amountCents, rate, nInstallments);
  }, [amountCents, rate, nInstallments]);

  // Fecha primera cuota = mes siguiente a la compra
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
    if (hasInterest && !rate) {
      toast.error("Ingresa la tasa de interés");
      return;
    }

    setLoading(true);
    try {
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
      {/* Descripción */}
      <div className="space-y-1.5">
        <Label htmlFor="pu-desc">Descripción</Label>
        <Input id="pu-desc" placeholder="Ej: iPhone 16, Nevera Samsung…"
          value={description} onChange={(e) => setDescription(e.target.value)} required />
      </div>

      {/* Monto y cuotas */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="pu-amount">Monto ({currency})</Label>
          <MoneyInput id="pu-amount" placeholder="0"
            value={amount} onChange={setAmount} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pu-inst">Número de cuotas</Label>
          <Input id="pu-inst" type="number" min="1" max="60"
            value={installments} onChange={(e) => setInstallments(e.target.value)} />
        </div>
      </div>

      {/* Toggle interés */}
      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <div>
          <p className="text-sm font-medium text-foreground">¿Genera intereses?</p>
          <p className="text-xs text-muted-foreground">Activa para calcular con interés compuesto</p>
        </div>
        <Switch checked={hasInterest} onCheckedChange={setHasInterest} />
      </div>

      {/* Tasa */}
      {hasInterest && (
        <div className="space-y-1.5">
          <Label htmlFor="pu-rate">Tasa mensual % (m.v.)</Label>
          <Input id="pu-rate" type="number" min="0.001" max="100" step="0.001"
            placeholder={defaultInterestRate ? (defaultInterestRate * 100).toFixed(2) : "Ej: 2.5"}
            value={interestRatePct} onChange={(e) => setInterestRatePct(e.target.value)} required />
        </div>
      )}

      {/* Categoría y fecha */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Categoría (opcional)</Label>
          <Select value={categoryId} onValueChange={(v) => setCategoryId(v ?? "")}>
            <SelectTrigger><SelectValue placeholder="Sin categoría" /></SelectTrigger>
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
          <DatePicker id="pu-date" value={purchaseDate}
            onChange={setPurchaseDate} required />
        </div>
      </div>

      {/* Preview del cronograma */}
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

            {/* Mini tabla de cuotas */}
            <div className="rounded-lg border border-border overflow-hidden text-xs">
              <div className="grid grid-cols-4 px-3 py-1.5 bg-muted/50 text-muted-foreground font-medium">
                <span>#</span><span>Capital</span><span>Interés</span><span className="text-right">Cuota</span>
              </div>
              {preview.schedule.slice(0, 6).map((s) => {
                const dueTs = new Date(purchaseDate);
                dueTs.setMonth(dueTs.getMonth() + s.installmentNumber);
                return (
                  <div key={s.installmentNumber}
                    className="grid grid-cols-4 px-3 py-1.5 border-t border-border">
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
        {loading ? "Registrando…" : "Registrar compra"}
      </Button>
    </form>
  );
}
