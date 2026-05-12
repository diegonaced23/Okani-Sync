"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MoneyInput } from "@/components/ui/money-input";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel,
  SelectSeparator, SelectTrigger,
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
  const createPurchase    = useMutation(api.cardPurchases.createPurchase);
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

  // Campos específicos de tarjeta de crédito
  const [installments, setInstallments]       = useState("1");
  const [hasInterest, setHasInterest]         = useState(false);
  const [interestRatePct, setInterestRatePct] = useState("");

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

    const isCard = sourceKind === "card" && !!sourceRawId;

    if (isCard) {
      const nInstallments = parseInt(installments) || 1;
      if (nInstallments < 1) {
        toast.error("El número de cuotas debe ser al menos 1");
        return;
      }
      const rate = hasInterest ? (parseFloat(interestRatePct) || 0) / 100 : 0;
      if (hasInterest && rate <= 0) {
        toast.error("Ingresa la tasa de interés");
        return;
      }

      const purchaseDate = new Date(date).getTime();
      const firstInstallmentDate = new Date(date);
      firstInstallmentDate.setMonth(firstInstallmentDate.getMonth() + 1);

      setLoading(true);
      try {
        await createPurchase({
          cardId: sourceRawId as Parameters<typeof createPurchase>[0]["cardId"],
          categoryId: categoryId
            ? (categoryId as Parameters<typeof createPurchase>[0]["categoryId"])
            : undefined,
          description: description.trim(),
          totalAmount: toCents(amountNum),
          totalInstallments: nInstallments,
          hasInterest,
          interestRate: hasInterest ? rate : undefined,
          purchaseDate,
          firstInstallmentDate: firstInstallmentDate.getTime(),
        });
        toast.success("Compra registrada y cronograma generado");
        onSuccess?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al registrar compra");
      } finally {
        setLoading(false);
      }
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
        <Select
          value={sourceId}
          onValueChange={(v) => {
            setSourceId(v ?? "");
            // Resetear campos de tarjeta si cambia la fuente
            const [kind] = (v ?? "").includes(":") ? (v ?? "").split(":") : [""];
            if (kind !== "card") {
              setInstallments("1");
              setHasInterest(false);
              setInterestRatePct("");
            }
          }}
        >
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
          <SelectContent alignItemWithTrigger={false} className="max-h-[40vh]">
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

      {/* ── Campos de tarjeta de crédito ──────────────────────────────────── */}
      {sourceKind === "card" && sourceRawId && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="tx-installments" className="text-[12px] font-semibold text-foreground mb-2 block">
                Cuotas <span aria-hidden="true" className="text-danger">*</span>
              </Label>
              <Input
                id="tx-installments"
                type="number"
                min="1"
                max="60"
                value={installments}
                onChange={(e) => setInstallments(e.target.value)}
                required
                aria-required="true"
                style={{ background: "var(--surface-2)" }}
              />
            </div>
            <div className="flex items-end pb-0.5">
              <div
                className="flex items-center justify-between rounded-xl w-full px-3 py-2.5"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
              >
                <span className="text-[12px] font-semibold text-foreground">¿Con interés?</span>
                <Switch
                  checked={hasInterest}
                  onCheckedChange={(v) => {
                    setHasInterest(v);
                    if (!v) setInterestRatePct("");
                    else if (selectedCard?.interestRate)
                      setInterestRatePct((selectedCard.interestRate * 100).toFixed(2));
                  }}
                  aria-label="Aplicar interés"
                />
              </div>
            </div>
          </div>

          {hasInterest && (
            <div>
              <Label htmlFor="tx-interest" className="text-[12px] font-semibold text-foreground mb-2 block">
                Tasa mensual % <span className="text-muted-foreground font-normal">(m.v.)</span>{" "}
                <span aria-hidden="true" className="text-danger">*</span>
              </Label>
              <Input
                id="tx-interest"
                type="number"
                min="0.001"
                max="100"
                step="0.001"
                placeholder={selectedCard?.interestRate
                  ? (selectedCard.interestRate * 100).toFixed(2)
                  : "Ej: 2.5"}
                value={interestRatePct}
                onChange={(e) => setInterestRatePct(e.target.value)}
                required
                aria-required="true"
                style={{ background: "var(--surface-2)" }}
              />
            </div>
          )}
        </>
      )}

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
            <SelectContent side="bottom" alignItemWithTrigger={false} className="max-h-[40vh]">
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
