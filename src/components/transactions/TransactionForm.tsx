"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel,
  SelectSeparator, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { toCents, formatCents } from "@/lib/money";
import { Check } from "lucide-react";
import { CategoryIcon } from "@/lib/category-icons";

// ─── Componente ───────────────────────────────────────────────────────────────

type TxType = "ingreso" | "gasto";

interface TransactionFormProps {
  defaultType?: TxType;
  onSuccess?: () => void;
}

export function TransactionForm({ defaultType = "gasto", onSuccess }: TransactionFormProps) {
  const createTransaction = useMutation(api.transactions.create);
  const accounts   = useQuery(api.accounts.list);
  const cards      = useQuery(api.cards.list);
  const categories = useQuery(api.categories.list, {});

  const [type]        = useState<TxType>(defaultType);
  const [amount, setAmount]           = useState("");
  const [description, setDescription] = useState("");
  // Valor codificado: "account:ID" | "card:ID" | ""
  const [sourceId, setSourceId]       = useState<string>("");
  const [categoryId, setCategoryId]   = useState<string>("");
  const [date, setDate]               = useState(() => new Date().toISOString().substring(0, 10));
  const [loading, setLoading]         = useState(false);

  const accountList = accounts ?? [];
  const cardList    = cards ?? [];

  // Derivar la moneda y el label del trigger desde la fuente seleccionada
  const [sourceKind, sourceRawId] = sourceId.includes(":") ? sourceId.split(":") : ["", ""];
  const selectedAccount = sourceKind === "account" ? accountList.find((a) => a._id === sourceRawId) : undefined;
  const selectedCard    = sourceKind === "card"    ? cardList.find((c) => c._id === sourceRawId)    : undefined;
  const currency = selectedAccount?.currency ?? selectedCard?.currency ?? "COP";

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
        accountId: sourceKind === "account" && sourceRawId
          ? (sourceRawId as Parameters<typeof createTransaction>[0]["accountId"])
          : undefined,
        cardId: sourceKind === "card" && sourceRawId
          ? (sourceRawId as Parameters<typeof createTransaction>[0]["cardId"])
          : undefined,
        categoryId: categoryId
          ? (categoryId as Parameters<typeof createTransaction>[0]["categoryId"])
          : undefined,
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

      {/* ── Monto — campo grande centrado ──────────────────────────────────── */}
      <div>
        <Label htmlFor="tx-amount" className="text-[12px] font-semibold text-foreground mb-2 block">
          Monto <span aria-hidden="true" className="text-danger">*</span>
        </Label>
        <div
          className="flex items-center justify-center rounded-xl focus-within:ring-2 focus-within:ring-ring"
          style={{
            background: "var(--surface-2)",
            padding: "18px 16px",
            "--ring": type === "ingreso" ? "var(--os-lime)" : "var(--os-magenta)",
          } as React.CSSProperties}
        >
          <MoneyInput
            id="tx-amount"
            value={amount}
            onChange={setAmount}
            placeholder="0"
            required
            aria-required="true"
            className="text-center border-none bg-transparent shadow-none focus-visible:ring-0 font-mono-num p-0 h-auto"
            style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.025em" }}
          />
        </div>
      </div>

      {/* ── Descripción ────────────────────────────────────────────────────── */}
      <div>
        <Label htmlFor="tx-desc" className="text-[12px] font-semibold text-foreground mb-2 block">
          Descripción <span aria-hidden="true" className="text-danger">*</span>
        </Label>
        <Input
          id="tx-desc"
          placeholder="Ej: Cena con amigos"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          aria-required="true"
          style={{ background: "var(--surface-2)" }}
        />
      </div>

      {/* ── Origen del pago ────────────────────────────────────────────────── */}
      <div>
        <Label htmlFor="tx-source" className="text-[12px] font-semibold text-foreground mb-2 block">
          {type === "ingreso" ? "Cuenta destino" : "Cuenta o tarjeta"}
        </Label>
        <Select value={sourceId} onValueChange={(v) => setSourceId(v ?? "")}>
          <SelectTrigger id="tx-source" className="w-full" style={{ background: "var(--surface-2)" }}>
            <span className="flex-1 text-left text-sm truncate">
              {selectedAccount ? (
                `${selectedAccount.name} · ${formatCents(selectedAccount.balance, selectedAccount.currency)}`
              ) : selectedCard ? (
                `${selectedCard.name} ····${selectedCard.lastFourDigits} · ${formatCents(selectedCard.availableCredit, selectedCard.currency)} disp.`
              ) : (
                <span className="text-muted-foreground">Sin origen</span>
              )}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Sin origen</SelectItem>
            {accountList.length > 0 && (
              <SelectGroup>
                <SelectLabel>Cuentas</SelectLabel>
                {accountList.map((a) => (
                  <SelectItem key={a._id} value={`account:${a._id}`}>
                    {a.name} · {formatCents(a.balance, a.currency)}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {type === "gasto" && cardList.length > 0 && (
              <>
                {accountList.length > 0 && <SelectSeparator />}
                <SelectGroup>
                  <SelectLabel>Tarjetas de crédito</SelectLabel>
                  {cardList.map((c) => (
                    <SelectItem key={c._id} value={`card:${c._id}`}>
                      {c.name} ····{c.lastFourDigits} · {formatCents(c.availableCredit, c.currency)} disp.
                    </SelectItem>
                  ))}
                </SelectGroup>
              </>
            )}
          </SelectContent>
        </Select>
      </div>

      {/* ── Fecha ──────────────────────────────────────────────────────────── */}
      <div>
        <Label htmlFor="tx-date" className="text-[12px] font-semibold text-foreground mb-2 block">
          Fecha
        </Label>
        <DatePicker id="tx-date" value={date} onChange={setDate} required style={{ background: "var(--surface-2)" }} />
      </div>

      {/* ── Categoría — dropdown ──────────────────────────────────────────── */}
      {filteredCategories.length > 0 && (
        <div>
          <Label htmlFor="tx-category" className="text-[12px] font-semibold text-foreground mb-2 block">
            Categoría
          </Label>
          <Select value={categoryId} onValueChange={(v) => setCategoryId(v ?? "")}>
            <SelectTrigger id="tx-category" className="w-full" style={{ background: "var(--surface-2)" }}>
              {categoryId ? (
                (() => {
                  const cat = filteredCategories.find((c) => c._id === categoryId);
                  return cat ? (
                    <span className="flex items-center gap-2 min-w-0">
                      <CategoryIcon
                        name={cat.icon}
                        aria-hidden
                        className="h-4 w-4 shrink-0"
                        style={{ color: cat.color }}
                        strokeWidth={1.8}
                      />
                      <span className="truncate">{cat.name}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Sin categoría</span>
                  );
                })()
              ) : (
                <span className="text-muted-foreground">Sin categoría</span>
              )}
            </SelectTrigger>
            <SelectContent side="bottom">
              <SelectItem value="">Sin categoría</SelectItem>
              {filteredCategories.map((cat) => (
                <SelectItem key={cat._id} value={cat._id}>
                  <CategoryIcon
                    name={cat.icon}
                    aria-hidden
                    className="h-[16px] w-[16px] shrink-0"
                    style={{ color: cat.color }}
                    strokeWidth={1.8}
                  />
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* ── Botón guardar — gradiente ───────────────────────────────────────── */}
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
        {loading ? "Guardando…" : "Guardar movimiento"}
      </button>

    </form>
  );
}
