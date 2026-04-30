"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { toCents, fromCents } from "@/lib/money";
import { CURRENCIES, ACCOUNT_GRADIENTS } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface CardFormProps {
  card?: Doc<"cards">;
  onSuccess?: () => void;
}

const BRANDS = [
  { value: "visa", label: "Visa" },
  { value: "mastercard", label: "Mastercard" },
  { value: "amex", label: "American Express" },
  { value: "diners", label: "Diners Club" },
  { value: "otro", label: "Otra" },
] as const;

const BRAND_LABELS: Record<string, string> = {
  visa: "Visa", mastercard: "Mastercard", amex: "American Express",
  diners: "Diners Club", otro: "Otra",
};

export function CardForm({ card, onSuccess }: CardFormProps) {
  const isEdit = !!card;
  const createCard = useMutation(api.cards.create);
  const updateCard = useMutation(api.cards.update);

  const [name, setName] = useState(card?.name ?? "");
  const [bankName, setBankName] = useState(card?.bankName ?? "");
  const [lastFour, setLastFour] = useState(card?.lastFourDigits ?? "");
  const [brand, setBrand] = useState<"visa" | "mastercard" | "amex" | "diners" | "otro">(
    card?.brand ?? "visa"
  );
  const [creditLimit, setCreditLimit] = useState(
    isEdit ? String(fromCents(card!.creditLimit)) : ""
  );
  const [cutoffDay, setCutoffDay] = useState(String(card?.cutoffDay ?? "25"));
  const [paymentDay, setPaymentDay] = useState(String(card?.paymentDay ?? "5"));
  const [interestRate, setInterestRate] = useState(
    card?.interestRate ? String((card.interestRate * 100).toFixed(2)) : ""
  );
  const [currency, setCurrency] = useState(card?.currency ?? "COP");
  const [color, setColor] = useState<string>(card?.color ?? ACCOUNT_GRADIENTS[0].key);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const limitNum = parseFloat(creditLimit) || 0;

    if (!isEdit && (!name.trim() || !bankName.trim() || lastFour.length !== 4 || limitNum <= 0)) {
      toast.error("Completa todos los campos obligatorios");
      return;
    }
    if (isEdit && limitNum <= 0) {
      toast.error("El cupo debe ser mayor que cero");
      return;
    }

    setLoading(true);
    try {
      if (isEdit) {
        await updateCard({
          cardId: card!._id as Id<"cards">,
          name: name.trim(),
          creditLimit: toCents(limitNum),
          cutoffDay: parseInt(cutoffDay),
          paymentDay: parseInt(paymentDay),
          interestRate: interestRate ? parseFloat(interestRate) / 100 : undefined,
          color,
        });
        toast.success("Tarjeta actualizada");
      } else {
        await createCard({
          name: name.trim(),
          bankName: bankName.trim(),
          lastFourDigits: lastFour,
          brand,
          creditLimit: toCents(limitNum),
          cutoffDay: parseInt(cutoffDay),
          paymentDay: parseInt(paymentDay),
          interestRate: interestRate ? parseFloat(interestRate) / 100 : undefined,
          currency,
          color,
          icon: "credit-card",
        });
        toast.success("Tarjeta creada correctamente");
      }
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  const days = Array.from({ length: 31 }, (_, i) => String(i + 1));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="card-name">Nombre de la tarjeta <span aria-hidden="true" className="text-danger">*</span></Label>
          <Input id="card-name" placeholder="Ej: Visa Bancolombia Oro" value={name}
            onChange={(e) => setName(e.target.value)} required />
        </div>

        {/* Campos solo en creación */}
        {!isEdit && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="card-bank">Banco <span aria-hidden="true" className="text-danger">*</span></Label>
              <Input id="card-bank" placeholder="Bancolombia" value={bankName}
                onChange={(e) => setBankName(e.target.value)} required />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="card-last4">Últimos 4 dígitos <span aria-hidden="true" className="text-danger">*</span></Label>
              <Input id="card-last4" placeholder="1234" maxLength={4} value={lastFour}
                onChange={(e) => setLastFour(e.target.value.replace(/\D/g, ""))} required />
            </div>

            <div className="space-y-1.5">
              <Label>Marca</Label>
              <Select value={brand} onValueChange={(v) => { if (v) setBrand(v as typeof brand); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BRANDS.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Moneda</Label>
              <Select value={currency} onValueChange={(v) => { if (v) setCurrency(v); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {/* Campos solo en edición: info no editable */}
        {isEdit && (
          <div className="col-span-2 grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Banco</Label>
              <p className="text-sm px-3 py-2 rounded-md bg-muted text-foreground">{card!.bankName}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Marca · Últimos 4</Label>
              <p className="text-sm px-3 py-2 rounded-md bg-muted text-foreground">
                {BRAND_LABELS[card!.brand ?? "otro"]} ···{card!.lastFourDigits}
              </p>
            </div>
          </div>
        )}

        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="card-limit">Cupo total <span aria-hidden="true" className="text-danger">*</span></Label>
          <MoneyInput id="card-limit" placeholder="5.000.000"
            value={creditLimit} onChange={setCreditLimit} required />
        </div>

        <div className="space-y-1.5">
          <Label>Día de corte</Label>
          <Select value={cutoffDay} onValueChange={(v) => { if (v) setCutoffDay(v); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{days.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Día de pago</Label>
          <Select value={paymentDay} onValueChange={(v) => { if (v) setPaymentDay(v); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{days.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="card-rate">Tasa de interés mensual % (opcional)</Label>
          <Input id="card-rate" type="number" min="0" max="100" step="0.01"
            placeholder="Ej: 2.5 (= 2.5% m.v.)"
            value={interestRate} onChange={(e) => setInterestRate(e.target.value)} />
          <p className="text-xs text-muted-foreground">Se usa como tasa default en compras a cuotas.</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Color de tarjeta</Label>
        <div className="flex flex-wrap gap-2">
          {ACCOUNT_GRADIENTS.map((g) => (
            <button key={g.key} type="button" onClick={() => setColor(g.key)}
              title={g.label}
              className={cn("h-8 w-8 rounded-full border-2 transition-all",
                color === g.key ? "border-foreground scale-110 shadow-md" : "border-transparent")}
              style={{ background: g.gradient }} aria-label={g.label} />
          ))}
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear tarjeta"}
      </Button>
    </form>
  );
}
