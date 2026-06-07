"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { MoneyInput } from "@/components/ui/money-input";
import { AccountCardSelect } from "./AccountCardSelect";
import { CategorySelect } from "./CategorySelect";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { fromCents, toCents, dateStrToTs, tsToDateStr } from "@/lib/money";
import { Check, X } from "lucide-react";
import { useAppData } from "@/contexts/app-data";

interface TransactionEditFormProps {
  tx: Doc<"transactions">;
  onSuccess: () => void;
  onCancel: () => void;
}

export function TransactionEditForm({ tx, onSuccess, onCancel }: TransactionEditFormProps) {
  const { categories, accountList, cardList } = useAppData();
  const updateTx = useMutation(api.transactions.update);

  // Inicializar desde tx; el componente se remonta cada vez que se activa el modo edición,
  // así que no hace falta el patrón prevTx aquí.
  const [desc, setDesc]             = useState(tx.description);
  const [amount, setAmount]         = useState(String(fromCents(tx.amount)));
  const [sourceId, setSourceId]     = useState<string>(
    tx.accountId ? `account:${tx.accountId}` :
    tx.cardId    ? `card:${tx.cardId}`        : ""
  );
  // tsToDateStr usa hora local para evitar el desfase UTC al mostrar la fecha
  const [date, setDate]             = useState(tsToDateStr(tx.date));
  const [categoryId, setCategoryId] = useState(tx.categoryId ?? "");
  const [loading, setLoading]       = useState(false);

  const [sourceKind, sourceRawId] = sourceId.includes(":") ? sourceId.split(":") : ["", ""];

  // Solo mostrar categorías que correspondan al tipo de la transacción
  const filteredCategories = (categories ?? []).filter(
    (c) => c.type === tx.type || c.type === "ambos"
  );

  async function handleSave() {
    if (!desc.trim()) {
      toast.error("La descripción es obligatoria");
      return;
    }

    // Transferencias: solo se edita la descripción
    if (tx.type === "transferencia") {
      setLoading(true);
      try {
        await updateTx({ transactionId: tx._id, description: desc.trim() });
        toast.success("Transferencia actualizada");
        onSuccess();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al actualizar");
      } finally {
        setLoading(false);
      }
      return;
    }

    const amountNum = parseFloat(amount.replace(/[^0-9.]/g, ""));
    if (!amountNum || amountNum <= 0) {
      toast.error("El monto debe ser mayor que cero");
      return;
    }
    setLoading(true);
    try {
      await updateTx({
        transactionId: tx._id,
        amount:      toCents(amountNum),
        description: desc.trim(),
        date:        dateStrToTs(date),
        categoryId:  categoryId ? (categoryId as Id<"categories">) : undefined,
        accountId:   sourceKind === "account" && sourceRawId ? (sourceRawId as Id<"accounts">) : undefined,
        cardId:      sourceKind === "card"    && sourceRawId ? (sourceRawId as Id<"cards">)    : undefined,
      });
      toast.success("Movimiento actualizado");
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">

      {/* Advertencia para transferencias: solo descripción es editable */}
      {tx.type === "transferencia" && (
        <div
          className="rounded-xl p-3 text-xs text-muted-foreground"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        >
          Las cuentas, el monto y la fecha no se pueden modificar. Elimina y recrea la transferencia si hay errores en los datos principales.
        </div>
      )}

      {/* Monto — oculto para transferencias */}
      {tx.type !== "transferencia" && (
        <div>
          <Label htmlFor="edit-amount" className="text-[12px] font-semibold text-foreground mb-2 block">
            Monto <span aria-hidden="true" className="text-danger">*</span>
          </Label>
          <div
            className="flex items-center justify-center rounded-xl focus-within:ring-2 focus-within:ring-ring"
            style={{
              background: "var(--surface-2)",
              padding: "14px 16px",
              "--ring": tx.type === "ingreso" ? "var(--os-lime)" : "var(--os-magenta)",
            } as React.CSSProperties}
          >
            <MoneyInput
              id="edit-amount"
              value={amount}
              onChange={setAmount}
              placeholder="0"
              required
              aria-required="true"
              className="text-center border-none bg-transparent shadow-none focus-visible:ring-0 font-mono-num p-0 h-auto"
              style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.025em" }}
            />
          </div>
        </div>
      )}

      {/* Cuenta o tarjeta — oculto para transferencias */}
      {tx.type !== "transferencia" && (
        <div>
          <Label htmlFor="edit-source" className="text-[12px] font-semibold text-foreground mb-2 block">
            {tx.type === "ingreso" ? "Cuenta destino" : "Cuenta o tarjeta"}
          </Label>
          <AccountCardSelect
            id="edit-source"
            value={sourceId}
            onValueChange={(v) => setSourceId(v ?? "")}
            accounts={accountList}
            cards={cardList}
            showCards={tx.type === "gasto"}
          />
        </div>
      )}

      {/* Descripción */}
      <div>
        <Label htmlFor="edit-desc" className="text-[12px] font-semibold text-foreground mb-2 block">
          Descripción <span aria-hidden="true" className="text-danger">*</span>
        </Label>
        <Input
          id="edit-desc"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          required
          aria-required="true"
          style={{ background: "var(--surface-2)" }}
        />
      </div>

      {/* Fecha — oculta para transferencias */}
      {tx.type !== "transferencia" && (
        <div>
          <Label htmlFor="edit-date" className="text-[12px] font-semibold text-foreground mb-2 block">
            Fecha
          </Label>
          <DatePicker id="edit-date" value={date} onChange={setDate} required style={{ background: "var(--surface-2)" }} />
        </div>
      )}

      {/* Categoría — oculta para transferencias */}
      {tx.type !== "transferencia" && filteredCategories.length > 0 && (
        <div>
          <Label htmlFor="edit-category" className="text-[12px] font-semibold text-foreground mb-2 block">
            Categoría
          </Label>
          <CategorySelect
            id="edit-category"
            value={categoryId}
            onValueChange={setCategoryId}
            categories={filteredCategories}
          />
        </div>
      )}

      {/* Guardar / Cancelar */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl font-bold transition-all active:scale-[0.98] disabled:opacity-60"
          style={{
            padding: "13px 16px",
            fontSize: 14,
            background: "linear-gradient(135deg, var(--os-lime), var(--os-cyan))",
            color: "var(--primary-foreground)",
            border: "none",
            cursor: loading ? "not-allowed" : "pointer",
            boxShadow: "0 6px 16px -4px color-mix(in oklch, var(--os-lime) 55%, transparent)",
          }}
        >
          <Check className="h-4 w-4" strokeWidth={2.5} />
          {loading ? "Guardando…" : "Guardar cambios"}
        </button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={loading}
          className="gap-1.5"
        >
          <X className="h-4 w-4" />
          Cancelar
        </Button>
      </div>

    </div>
  );
}
