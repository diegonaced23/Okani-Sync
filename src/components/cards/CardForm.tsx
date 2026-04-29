"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { toCents } from "@/lib/money";
import { CURRENCIES, ACCOUNT_GRADIENTS } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface CardFormProps {
  onSuccess?: () => void;
}

const BRANDS = [
  { value: "visa", label: "Visa" },
  { value: "mastercard", label: "Mastercard" },
  { value: "amex", label: "American Express" },
  { value: "diners", label: "Diners Club" },
  { value: "otro", label: "Otra" },
] as const;

export function CardForm({ onSuccess }: CardFormProps) {
  const createCard = useMutation(api.cards.create);

  const [name, setName] = useState("");
  const [bankName, setBankName] = useState("");
  const [lastFour, setLastFour] = useState("");
  const [brand, setBrand] = useState<"visa" | "mastercard" | "amex" | "diners" | "otro">("visa");
  const [creditLimit, setCreditLimit] = useState("");
  const [cutoffDay, setCutoffDay] = useState("25");
  const [paymentDay, setPaymentDay] = useState("5");
  const [interestRate, setInterestRate] = useState("");
  const [currency, setCurrency] = useState("COP");
  const [color, setColor] = useState<string>(ACCOUNT_GRADIENTS[0].key);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const limitNum = parseFloat(creditLimit) || 0;
    if (!name.trim() || !bankName.trim() || lastFour.length !== 4 || limitNum <= 0) {
      toast.error("Completa todos los campos obligatorios");
      return;
    }

    setLoading(true);
    try {
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
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear tarjeta");
    } finally {
      setLoading(false);
    }
  }

  const days = Array.from({ length: 31 }, (_, i) => String(i + 1));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="card-name">Nombre de la tarjeta</Label>
          <Input id="card-name" placeholder="Ej: Visa Bancolombia Oro" value={name}
            onChange={(e) => setName(e.target.value)} required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="card-bank">Banco</Label>
          <Input id="card-bank" placeholder="Bancolombia" value={bankName}
            onChange={(e) => setBankName(e.target.value)} required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="card-last4">Últimos 4 dígitos</Label>
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

        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="card-limit">Cupo total</Label>
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
        {loading ? "Guardando…" : "Crear tarjeta"}
      </Button>
    </form>
  );
}
