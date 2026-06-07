"use client";

import { useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { Label } from "@/components/ui/label";
import { todayStr } from "@/lib/money";
import { AccountCardSelect } from "./AccountCardSelect";
import { AccountTransactionFields } from "./AccountTransactionFields";
import { CardPurchaseFields } from "./CardPurchaseFields";
import { useAppData } from "@/contexts/app-data";

type TxType = "ingreso" | "gasto";

interface TransactionFormProps {
  defaultType?: TxType;
  // Fuente pre-seleccionada en formato "card:ID" o "account:ID"; usada por el flujo "Registrar pago"
  initialSourceId?: string;
  onSuccess?: () => void;
}

export function TransactionForm({ defaultType = "gasto", initialSourceId, onSuccess }: TransactionFormProps) {
  const { accountList, cardList } = useAppData();

  const [type]    = useState<TxType>(defaultType);
  // Estado compartido que sobrevive al cambio entre fuente de cuenta y tarjeta
  const [sourceId, setSourceId]       = useState<string>(initialSourceId ?? "");
  const [amount, setAmount]           = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate]               = useState(todayStr);

  // Decodificar la fuente seleccionada
  const [sourceKind, sourceRawId] = sourceId.includes(":") ? sourceId.split(":") : ["", ""];
  const selectedAccount = sourceKind === "account"
    ? accountList.find((a) => a._id === sourceRawId)
    : undefined;
  const selectedCard = sourceKind === "card"
    ? cardList.find((c) => c._id === sourceRawId)
    : undefined;
  const currency = selectedAccount?.currency ?? selectedCard?.currency ?? "COP";

  const isCard = sourceKind === "card" && !!selectedCard;

  return (
    <div className="space-y-4">

      {/* ── Origen del pago — compartido entre ambos sub-formularios ──────── */}
      <div>
        <Label htmlFor="tx-source" className="text-[12px] font-semibold text-foreground mb-2 block">
          {type === "ingreso" ? "Cuenta destino" : "Cuenta o tarjeta"}
        </Label>
        <AccountCardSelect
          id="tx-source"
          value={sourceId}
          onValueChange={(v) => setSourceId(v ?? "")}
          accounts={accountList}
          cards={cardList}
          showCards={type === "gasto"}
        />
      </div>

      {/* ── Sub-formulario según tipo de fuente ───────────────────────────── */}
      {isCard ? (
        <CardPurchaseFields
          card={selectedCard}
          amount={amount}
          description={description}
          date={date}
          onAmountChange={setAmount}
          onDescChange={setDescription}
          onDateChange={setDate}
          onSuccess={onSuccess}
        />
      ) : (
        <AccountTransactionFields
          type={type}
          amount={amount}
          description={description}
          date={date}
          onAmountChange={setAmount}
          onDescChange={setDescription}
          onDateChange={setDate}
          accountId={sourceKind === "account" && sourceRawId
            ? (sourceRawId as Id<"accounts">)
            : undefined}
          currency={currency}
          onSuccess={onSuccess}
        />
      )}

    </div>
  );
}
