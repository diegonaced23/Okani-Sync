"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel,
  SelectSeparator, SelectTrigger,
} from "@/components/ui/select";
import { toast } from "sonner";
import { toCents, formatCents } from "@/lib/money";
import { Check } from "lucide-react";
import { CategoryIcon } from "@/lib/category-icons";

interface RecurrenteFormProps {
  recurrente?: Doc<"recurringTransactions">;
  onSuccess?: () => void;
}

export function RecurrenteForm({ recurrente, onSuccess }: RecurrenteFormProps) {
  const createRecurrente = useMutation(api.recurringTransactions.create);
  const updateRecurrente = useMutation(api.recurringTransactions.update);
  const accounts  = useQuery(api.accounts.list);
  const cards     = useQuery(api.cards.list);
  const categories = useQuery(api.categories.list, {});

  const isEditing = recurrente !== undefined;

  const [amount, setAmount] = useState(() =>
    recurrente ? String(recurrente.amount / 100) : ""
  );
  const [description, setDescription] = useState(recurrente?.description ?? "");
  const [sourceId, setSourceId] = useState<string>(() => {
    if (recurrente?.accountId) return `account:${recurrente.accountId}`;
    if (recurrente?.cardId)    return `card:${recurrente.cardId}`;
    return "";
  });
  const [categoryId, setCategoryId] = useState<string>(recurrente?.categoryId ?? "");
  const [dayOfMonth, setDayOfMonth] = useState<string>(
    recurrente?.dayOfMonth ? String(recurrente.dayOfMonth) : ""
  );
  const [loading, setLoading] = useState(false);

  const accountList = accounts ?? [];
  const cardList    = cards ?? [];

  const [sourceKind, sourceRawId] = sourceId.includes(":") ? sourceId.split(":") : ["", ""];
  const selectedAccount = sourceKind === "account" ? accountList.find((a) => a._id === sourceRawId) : undefined;
  const selectedCard    = sourceKind === "card"    ? cardList.find((c) => c._id === sourceRawId)    : undefined;
  const currency = selectedAccount?.currency ?? selectedCard?.currency ?? "COP";

  const filteredCategories = (categories ?? []).filter(
    (c) => c.type === "gasto" || c.type === "ambos"
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
    if (!sourceId) {
      toast.error("Selecciona una cuenta o tarjeta");
      return;
    }
    const day = parseInt(dayOfMonth, 10);
    if (!day || day < 1 || day > 28) {
      toast.error("El día del mes debe estar entre 1 y 28");
      return;
    }

    setLoading(true);
    try {
      const accountId = sourceKind === "account" && sourceRawId
        ? (sourceRawId as Id<"accounts">)
        : undefined;
      const cardId = sourceKind === "card" && sourceRawId
        ? (sourceRawId as Id<"cards">)
        : undefined;
      const catId = categoryId ? (categoryId as Id<"categories">) : undefined;

      if (isEditing) {
        const prevSourceKind = recurrente.accountId ? "account" : "card";
        await updateRecurrente({
          recurringId: recurrente._id,
          description: description.trim(),
          amount: toCents(amountNum),
          accountId: sourceKind === "account" ? accountId : undefined,
          cardId: sourceKind === "card" ? cardId : undefined,
          categoryId: catId,
          clearCategory: !catId && prevSourceKind !== sourceKind ? false : !catId,
          dayOfMonth: day,
        });
        toast.success("Recurrente actualizado");
      } else {
        await createRecurrente({
          description: description.trim(),
          amount: toCents(amountNum),
          accountId,
          cardId,
          categoryId: catId,
          dayOfMonth: day,
          currency,
        });
        toast.success("Movimiento recurrente creado");
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

      {/* Monto */}
      <div>
        <Label htmlFor="rec-amount" className="text-[12px] font-semibold text-foreground mb-2 block">
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
            id="rec-amount"
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

      {/* Descripción */}
      <div>
        <Label htmlFor="rec-desc" className="text-[12px] font-semibold text-foreground mb-2 block">
          Descripción <span aria-hidden="true" className="text-danger">*</span>
        </Label>
        <Input
          id="rec-desc"
          placeholder="Ej: Netflix, Arriendo, Gimnasio"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={100}
          required
          aria-required="true"
          style={{ background: "var(--surface-2)" }}
        />
      </div>

      {/* Cuenta o tarjeta */}
      <div>
        <Label htmlFor="rec-source" className="text-[12px] font-semibold text-foreground mb-2 block">
          Cuenta o tarjeta <span aria-hidden="true" className="text-danger">*</span>
        </Label>
        <Select value={sourceId} onValueChange={(v) => setSourceId(v ?? "")}>
          <SelectTrigger id="rec-source" className="w-full" style={{ background: "var(--surface-2)" }}>
            <span className="flex-1 text-left text-sm truncate">
              {selectedAccount ? (
                `${selectedAccount.name} · ${formatCents(selectedAccount.balance, selectedAccount.currency)}`
              ) : selectedCard ? (
                `${selectedCard.name} ····${selectedCard.lastFourDigits} · ${formatCents(selectedCard.availableCredit, selectedCard.currency)} disp.`
              ) : (
                <span className="text-muted-foreground">Seleccionar</span>
              )}
            </span>
          </SelectTrigger>
          <SelectContent>
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
            {cardList.length > 0 && (
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

      {/* Día del mes */}
      <div>
        <Label htmlFor="rec-day" className="text-[12px] font-semibold text-foreground mb-2 block">
          Día del mes <span aria-hidden="true" className="text-danger">*</span>
        </Label>
        <Input
          id="rec-day"
          type="number"
          inputMode="numeric"
          min={1}
          max={28}
          placeholder="Ej: 5"
          value={dayOfMonth}
          onChange={(e) => setDayOfMonth(e.target.value)}
          required
          aria-required="true"
          style={{ background: "var(--surface-2)" }}
        />
        <p className="text-[11px] text-muted-foreground mt-1.5">
          El gasto se registrará automáticamente ese día cada mes.
        </p>
      </div>

      {/* Categoría */}
      {filteredCategories.length > 0 && (
        <div>
          <p id="rec-category-label" className="text-[12px] font-semibold text-foreground mb-2">
            Categoría
          </p>
          <div
            role="group"
            aria-labelledby="rec-category-label"
            className="flex gap-2 overflow-x-auto py-1"
            style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch", overscrollBehaviorX: "contain" } as React.CSSProperties}
          >
            {filteredCategories.map((cat) => {
              const isActive = categoryId === cat._id;
              return (
                <button
                  key={cat._id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setCategoryId(isActive ? "" : cat._id)}
                  className="flex-none flex items-center gap-1.5 transition-all active:scale-95"
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    whiteSpace: "nowrap",
                    background: isActive
                      ? "color-mix(in oklch, var(--os-lime) 14%, var(--surface))"
                      : "var(--surface-2)",
                    border: isActive
                      ? "1.5px solid var(--os-lime)"
                      : "1.5px solid transparent",
                    transition: "all 0.2s cubic-bezier(0.34,1.56,0.64,1)",
                  }}
                >
                  <CategoryIcon
                    name={cat.icon}
                    aria-hidden
                    className="h-[16px] w-[16px] shrink-0"
                    style={{ color: isActive ? "var(--os-lime)" : cat.color }}
                    strokeWidth={1.8}
                  />
                  <span
                    className="text-[12px] font-semibold"
                    style={{ color: isActive ? "var(--foreground)" : "var(--muted-foreground)" }}
                  >
                    {cat.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Botón guardar */}
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
        {loading ? "Guardando…" : isEditing ? "Guardar cambios" : "Crear recurrente"}
      </button>

    </form>
  );
}
