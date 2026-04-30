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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { toCents } from "@/lib/money";
import { CURRENCIES, ACCOUNT_GRADIENTS } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface AccountFormProps {
  account?: Doc<"accounts">;
  onSuccess?: () => void;
}

const ACCOUNT_TYPES = [
  { value: "bancaria", label: "Cuenta bancaria" },
  { value: "ahorros", label: "Cuenta de ahorros" },
  { value: "inversion", label: "Inversión" },
] as const;

export function AccountForm({ account, onSuccess }: AccountFormProps) {
  const isEdit = !!account;
  const createAccount = useMutation(api.accounts.create);
  const updateAccount = useMutation(api.accounts.update);

  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<"billetera" | "bancaria" | "ahorros" | "inversion">(
    account?.type ?? "bancaria"
  );
  const [bankName, setBankName] = useState(account?.bankName ?? "");
  const [accountNumber, setAccountNumber] = useState(account?.accountNumber ?? "");
  const [initialBalance, setInitialBalance] = useState("");
  const [currency, setCurrency] = useState(account?.currency ?? "COP");
  const [color, setColor] = useState<string>(account?.color ?? ACCOUNT_GRADIENTS[0].key);
  const [loading, setLoading] = useState(false);

  const showBank = type !== "billetera";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      if (isEdit) {
        await updateAccount({
          accountId: account!._id as Id<"accounts">,
          name: name.trim(),
          type,
          bankName: showBank ? bankName.trim() || undefined : undefined,
          accountNumber: accountNumber.trim() || undefined,
          color,
        });
        toast.success("Cuenta actualizada");
      } else {
        const balanceNum = parseFloat(initialBalance.replace(/[^0-9.-]/g, "")) || 0;
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
      }
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="acc-name">Nombre de la cuenta <span aria-hidden="true" className="text-danger">*</span></Label>
        <Input
          id="acc-name"
          placeholder="Ej: Bancolombia Ahorros"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label>Tipo</Label>
        <Select value={type} onValueChange={(v) => { if (v) setType(v as typeof type); }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {ACCOUNT_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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

      {/* Saldo inicial solo en creación */}
      {!isEdit && (
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
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* En edición: moneda no editable */}
      {isEdit && (
        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs">Moneda</Label>
          <p className="text-sm px-3 py-2 rounded-md bg-muted text-foreground">{account!.currency}</p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Color</Label>
        <div className="flex flex-wrap gap-2">
          {ACCOUNT_GRADIENTS.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => setColor(g.key)}
              title={g.label}
              className={cn(
                "h-8 w-8 rounded-full border-2 transition-all",
                color === g.key ? "border-foreground scale-110 shadow-md" : "border-transparent"
              )}
              style={{ background: g.gradient }}
              aria-label={g.label}
            />
          ))}
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear cuenta"}
      </Button>
    </form>
  );
}
