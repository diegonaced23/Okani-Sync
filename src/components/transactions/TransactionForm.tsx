"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
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
  const me = useQuery(api.users.getMe);

  const [type]    = useState<TxType>(defaultType);
  // Estado compartido que sobrevive al cambio entre fuente de cuenta y tarjeta.
  // Una tarjeta nunca es origen de un ingreso: si llega preseleccionada, se descarta.
  const [sourceId, setSourceId]       = useState<string>(
    initialSourceId && !(defaultType === "ingreso" && initialSourceId.startsWith("card:"))
      ? initialSourceId
      : ""
  );
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
  // Sin fuente elegida manda la moneda preferida, no un "COP" fijo: esta es la moneda
  // con la que se crea el movimiento, no solo la de la etiqueta.
  const currency = selectedAccount?.currency ?? selectedCard?.currency ?? me?.currency ?? "COP";

  // El tipo también decide: una compra a cuotas solo existe como gasto
  const isCard = type === "gasto" && sourceKind === "card" && !!selectedCard;

  return (
    <div className="space-y-4">

      {/* ── Origen del pago — compartido entre ambos sub-formularios ──────── */}
      <div>
        <span className="mb-2 block px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          {type === "ingreso" ? "Cuenta destino" : "Cuenta o tarjeta"}
        </span>
        <AccountCardSelect
          id="tx-source"
          ariaLabel={type === "ingreso" ? "Cuenta destino" : "Cuenta o tarjeta"}
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
