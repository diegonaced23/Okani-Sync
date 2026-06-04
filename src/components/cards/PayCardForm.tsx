"use client";

import { useState, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import { formatCents, toCents, fromCents, todayStr, simulateFIFOPayment } from "@/lib/money";
import { CheckCircle2, Circle, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

interface PayCardFormProps {
  card: Doc<"cards">;
  onSuccess: () => void;
}

export function PayCardForm({ card, onSuccess }: PayCardFormProps) {
  const payCard = useMutation(api.cards.payCard);
  const accounts = useQuery(api.accounts.list, {});
  const allInstallments = useQuery(api.cardInstallments.listAllByCard, { cardId: card._id });

  // Montos sugeridos calculados en el servidor según el ciclo de corte real
  const summary = useQuery(api.cards.getPaymentSummary, { cardId: card._id });

  const [fromAccountId, setFromAccountId] = useState("");
  const [amountStr, setAmountStr] = useState(
    () => String(fromCents(card.currentBalance))
  );
  // todayStr() usa hora local; toISOString() daría fecha UTC que puede diferir un día
  const [paymentDate, setPaymentDate] = useState(todayStr);
  const [loading, setLoading] = useState(false);
  const [fifoExpanded, setFifoExpanded] = useState(true);

  const validAccounts = useMemo(
    () => (accounts ?? []).filter((a) => a.currency === card.currency),
    [accounts, card.currency]
  );

  const selectedAccount = validAccounts.find((a) => a._id === fromAccountId);
  const amountCents = toCents(parseFloat(amountStr) || 0);
  const isOverBalance = amountCents > card.currentBalance;

  // Simulación FIFO — se recalcula en cada cambio de monto (sin llamadas a la BD)
  const fifoSimulation = useMemo(() => {
    if (!allInstallments || amountCents <= 0) return null;
    return simulateFIFOPayment(allInstallments, card.currentBalance, amountCents);
  }, [allInstallments, card.currentBalance, amountCents]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fromAccountId) {
      toast.error("Selecciona una cuenta de origen");
      return;
    }
    if (amountCents <= 0) {
      toast.error("El monto debe ser mayor que cero");
      return;
    }

    setLoading(true);
    try {
      const paymentTs = new Date(paymentDate + "T12:00:00").getTime();
      await payCard({
        cardId: card._id,
        fromAccountId: fromAccountId as Id<"accounts">,
        amount: amountCents,
        paymentDate: paymentTs,
      });
      toast.success(`Pago de ${formatCents(amountCents, card.currency)} registrado`);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al realizar el pago");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Resumen de deuda */}
      <div className="rounded-xl bg-muted/50 border border-border p-4 text-center space-y-1">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">
          Saldo pendiente
        </p>
        <p className="text-3xl font-bold tabular-nums text-foreground">
          {formatCents(card.currentBalance, card.currency)}
        </p>
      </div>

      {/* Botones de pago rápido */}
      <div className="grid grid-cols-2 gap-2">
        {/* Pago mínimo: cuotas que vencen en el ciclo de corte actual */}
        <button
          type="button"
          disabled={!summary || summary.minimumPayment <= 0}
          onClick={() => summary && setAmountStr(String(fromCents(summary.minimumPayment)))}
          className="flex flex-col items-start gap-0.5 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-left transition-colors hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {/* Etiqueta del botón */}
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Pago mínimo
          </span>
          {/* Monto calculado o indicador de carga */}
          <span className="text-sm font-bold tabular-nums text-foreground">
            {summary
              ? formatCents(summary.minimumPayment, card.currency)
              : "—"}
          </span>
        </button>

        {/* Pago total: sin interés → liquida todo; con interés → cuota actual (capital + interés) */}
        <button
          type="button"
          disabled={!summary || summary.totalPayment <= 0}
          onClick={() => summary && setAmountStr(String(fromCents(summary.totalPayment)))}
          className="flex flex-col items-start gap-0.5 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2.5 text-left transition-colors hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {/* Etiqueta del botón */}
          <span className="text-[10px] font-semibold uppercase tracking-wider text-primary/70">
            Pago total
          </span>
          {/* Monto calculado o indicador de carga */}
          <span className="text-sm font-bold tabular-nums text-primary">
            {summary
              ? formatCents(summary.totalPayment, card.currency)
              : "—"}
          </span>
        </button>
      </div>

      {/* Monto a pagar — editable manualmente */}
      <div className="space-y-1.5">
        <Label>Monto a pagar</Label>
        <MoneyInput
          value={amountStr}
          onChange={setAmountStr}
          placeholder="0"
        />
        {isOverBalance && (
          <p className="text-xs text-amber-500">
            El monto supera el saldo. Se aplicará el máximo disponible ({formatCents(card.currentBalance, card.currency)}).
          </p>
        )}
      </div>

      {/* Cuenta de origen */}
      <div className="space-y-1.5">
        <Label>Cuenta de origen</Label>
        {validAccounts.length === 0 ? (
          <p className="text-sm text-muted-foreground rounded-lg border border-border px-3 py-2">
            No tienes cuentas en {card.currency}. Crea una cuenta en esa moneda primero.
          </p>
        ) : (
          <Select value={fromAccountId} onValueChange={(v) => setFromAccountId(v ?? "")}>
            <SelectTrigger>
              <span className="flex-1 text-left text-sm truncate">
                {selectedAccount
                  ? selectedAccount.name
                  : <span className="text-muted-foreground">Seleccionar cuenta…</span>}
              </span>
            </SelectTrigger>
            <SelectContent>
              {validAccounts.map((a) => (
                <SelectItem key={a._id} value={a._id}>
                  <span className="flex items-center gap-2">
                    <span>{a.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatCents(a.balance, a.currency)}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Fecha de pago */}
      <div className="space-y-1.5">
        <Label>Fecha de pago</Label>
        <DatePicker value={paymentDate} onChange={setPaymentDate} required />
      </div>

      {/* ── Desglose FIFO ─────────────────────────────────────────────── */}
      {fifoSimulation && (fifoSimulation.newlyPaid.length > 0 || fifoSimulation.stillUnpaid.length > 0) && (
        <div className="rounded-xl border border-border overflow-hidden">
          {/* Encabezado colapsable */}
          <button
            type="button"
            onClick={() => setFifoExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-left bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Distribución del pago
            </span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">
                {fifoSimulation.newlyPaid.length} cuota{fifoSimulation.newlyPaid.length !== 1 ? "s" : ""} saldada{fifoSimulation.newlyPaid.length !== 1 ? "s" : ""}
              </span>
              {fifoExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </span>
          </button>

          {fifoExpanded && (
            <ul className="divide-y divide-border">
              {/* Cuotas que quedarán pagadas */}
              {fifoSimulation.newlyPaid.map((inst) => (
                <li key={inst._id} className="px-4 py-2.5 flex items-center gap-3">
                  <CheckCircle2 size={16} className="shrink-0" style={{ color: "var(--os-lime)" }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{inst.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(inst.dueDate).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums shrink-0" style={{ color: "var(--os-lime)" }}>
                    {formatCents(inst.amount, card.currency)}
                  </span>
                </li>
              ))}

              {/* Cuotas que quedan pendientes */}
              {fifoSimulation.stillUnpaid.map((inst) => (
                <li key={inst._id} className="px-4 py-2.5 flex items-center gap-3 opacity-50">
                  <Circle size={16} className="shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{inst.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(inst.dueDate).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums shrink-0 text-muted-foreground">
                    {formatCents(inst.amount, card.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Saldo restante */}
          {fifoExpanded && (
            <div className="px-4 py-2.5 border-t border-border flex items-center justify-between bg-muted/20">
              <span className="text-xs font-semibold text-muted-foreground">Saldo restante</span>
              <span className="text-sm font-bold tabular-nums text-foreground">
                {formatCents(fifoSimulation.newBalance, card.currency)}
              </span>
            </div>
          )}
        </div>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={loading || validAccounts.length === 0 || !fromAccountId || amountCents <= 0}
      >
        {loading ? "Procesando…" : "Confirmar pago"}
      </Button>
    </form>
  );
}
