"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { toCents, currentMonth } from "@/lib/money";
import { CURRENCIES } from "@/lib/constants";

type TxType = "ingreso" | "gasto";

interface TransactionFormProps {
  defaultType?: TxType;
  onSuccess?: () => void;
}

export function TransactionForm({ defaultType = "gasto", onSuccess }: TransactionFormProps) {
  const createTransaction = useMutation(api.transactions.create);
  const accounts = useQuery(api.accounts.list);
  const categories = useQuery(api.categories.list, {});

  const [type, setType] = useState<TxType>(defaultType);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [accountId, setAccountId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [currency, setCurrency] = useState("COP");
  const [date, setDate] = useState(() => new Date().toISOString().substring(0, 10));
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const filteredCategories = (categories ?? []).filter(
    (c) => c.type === type || c.type === "ambos"
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountNum = parseFloat(amount.replace(/[^0-9.]/g, ""));
    if (!amountNum || amountNum <= 0) {
      toast.error("El monto debe ser mayor que cero");
      return;
    }
    if (!description.trim()) {
      toast.error("La descripción es obligatoria");
      return;
    }

    setLoading(true);
    try {
      await createTransaction({
        type,
        amount: toCents(amountNum),
        description: description.trim(),
        date: new Date(date).getTime(),
        currency,
        accountId: accountId ? (accountId as Parameters<typeof createTransaction>[0]["accountId"]) : undefined,
        categoryId: categoryId ? (categoryId as Parameters<typeof createTransaction>[0]["categoryId"]) : undefined,
        notes: notes.trim() || undefined,
      });
      toast.success(type === "ingreso" ? "Ingreso registrado" : "Gasto registrado");
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Tipo */}
      <div className="flex rounded-lg border border-border overflow-hidden">
        {(["gasto", "ingreso"] as TxType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`flex-1 py-2 text-sm font-medium transition-colors capitalize ${
              type === t
                ? t === "gasto"
                  ? "bg-danger text-white"
                  : "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Monto y moneda */}
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="tx-amount">Monto</Label>
          <Input
            id="tx-amount"
            type="number"
            min="0.01"
            step="any"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
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
                <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Descripción */}
      <div className="space-y-1.5">
        <Label htmlFor="tx-desc">Descripción</Label>
        <Input
          id="tx-desc"
          placeholder="Ej: Almuerzo, gasolina…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />
      </div>

      {/* Fecha */}
      <div className="space-y-1.5">
        <Label htmlFor="tx-date">Fecha</Label>
        <Input
          id="tx-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>

      {/* Cuenta */}
      <div className="space-y-1.5">
        <Label>Cuenta (opcional)</Label>
        <Select value={accountId} onValueChange={(v) => setAccountId(v ?? "")}>
          <SelectTrigger>
            <SelectValue placeholder="Sin cuenta" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Sin cuenta</SelectItem>
            {(accounts ?? []).map((a) => (
              <SelectItem key={a._id} value={a._id}>
                {a.name} — {a.currency}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Categoría */}
      <div className="space-y-1.5">
        <Label>Categoría (opcional)</Label>
        <Select value={categoryId} onValueChange={(v) => setCategoryId(v ?? "")}>
          <SelectTrigger>
            <SelectValue placeholder="Sin categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Sin categoría</SelectItem>
            {filteredCategories.map((c) => (
              <SelectItem key={c._id} value={c._id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Notas */}
      <div className="space-y-1.5">
        <Label htmlFor="tx-notes">Notas (opcional)</Label>
        <Textarea
          id="tx-notes"
          rows={2}
          placeholder="Observaciones adicionales…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Guardando…" : type === "ingreso" ? "Registrar ingreso" : "Registrar gasto"}
      </Button>
    </form>
  );
}
