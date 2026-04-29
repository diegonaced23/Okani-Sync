"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { toCents } from "@/lib/money";
import { CURRENCIES, ACCOUNT_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface AccountFormProps {
  onSuccess?: () => void;
}

const ACCOUNT_TYPES = [
  { value: "billetera", label: "Billetera (efectivo)" },
  { value: "bancaria", label: "Cuenta bancaria" },
  { value: "ahorros", label: "Cuenta de ahorros" },
  { value: "inversion", label: "Inversión" },
] as const;

export function AccountForm({ onSuccess }: AccountFormProps) {
  const createAccount = useMutation(api.accounts.create);

  const [name, setName] = useState("");
  const [type, setType] = useState<"billetera" | "bancaria" | "ahorros" | "inversion">("billetera");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [initialBalance, setInitialBalance] = useState("");
  const [currency, setCurrency] = useState("COP");
  const [color, setColor] = useState(ACCOUNT_COLORS[0]);
  const [loading, setLoading] = useState(false);

  const showBank = type !== "billetera";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    const balanceNum = parseFloat(initialBalance.replace(/[^0-9.-]/g, "")) || 0;

    setLoading(true);
    try {
      await createAccount({
        name: name.trim(),
        type,
        bankName: showBank ? bankName.trim() || undefined : undefined,
        accountNumber: accountNumber.trim() || undefined,
        initialBalance: toCents(balanceNum),
        currency,
        color,
        icon: "landmark",
      });
      toast.success("Cuenta creada correctamente");
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear la cuenta");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Nombre */}
      <div className="space-y-1.5">
        <Label htmlFor="acc-name">Nombre de la cuenta</Label>
        <Input
          id="acc-name"
          placeholder="Ej: Bancolombia Ahorros"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      {/* Tipo */}
      <div className="space-y-1.5">
        <Label>Tipo</Label>
        <Select value={type} onValueChange={(v) => { if (v) setType(v as typeof type); }}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACCOUNT_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Banco (solo para no-billetera) */}
      {showBank && (
        <div className="space-y-1.5">
          <Label htmlFor="acc-bank">Banco</Label>
          <Input
            id="acc-bank"
            placeholder="Ej: Bancolombia"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
          />
        </div>
      )}

      {/* Últimos 4 dígitos */}
      {showBank && (
        <div className="space-y-1.5">
          <Label htmlFor="acc-number">Últimos 4 dígitos (opcional)</Label>
          <Input
            id="acc-number"
            placeholder="1234"
            maxLength={4}
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
          />
        </div>
      )}

      {/* Saldo inicial y moneda */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="acc-balance">Saldo inicial</Label>
          <MoneyInput
            id="acc-balance"
            placeholder="0"
            value={initialBalance}
            onChange={setInitialBalance}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Moneda</Label>
          <Select value={currency} onValueChange={(v) => { if (v) setCurrency(v); }}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Color */}
      <div className="space-y-1.5">
        <Label>Color</Label>
        <div className="flex flex-wrap gap-2">
          {ACCOUNT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={cn(
                "h-7 w-7 rounded-full border-2 transition-transform",
                color === c ? "border-foreground scale-110" : "border-transparent"
              )}
              style={{ backgroundColor: c }}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Guardando…" : "Crear cuenta"}
      </Button>
    </form>
  );
}
