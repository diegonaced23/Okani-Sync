"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { toast } from "sonner";
import { toCents, fromCents, formatCents } from "@/lib/money";

interface BalanceReassignFormProps {
  account: Doc<"accounts">;
  onSuccess?: () => void;
}

export function BalanceReassignForm({ account, onSuccess }: BalanceReassignFormProps) {
  const hasTx = useQuery(api.accounts.hasTransactions, { accountId: account._id });
  const reassign = useMutation(api.accounts.reassignBalance);
  const correct = useMutation(api.accounts.correctBalance);
  const [newBalanceStr, setNewBalanceStr] = useState(String(fromCents(account.balance)));
  const [loading, setLoading] = useState(false);

  const parsed = parseFloat(newBalanceStr.replace(/[^0-9.-]/g, ""));
  const newBalanceCents = Number.isFinite(parsed) ? toCents(parsed) : NaN;
  const isValid = Number.isInteger(newBalanceCents) && newBalanceCents >= 0;
  const delta = isValid ? newBalanceCents - account.balance : 0;
  const isNoOp = isValid && delta === 0;
  const isReady = hasTx !== undefined;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) {
      toast.error("Ingresa un saldo válido (≥ 0)");
      return;
    }
    if (isNoOp) {
      toast.info("El saldo no ha cambiado");
      return;
    }
    setLoading(true);
    try {
      if (hasTx) {
        const result = await reassign({ accountId: account._id, newBalance: newBalanceCents });
        if (result.adjusted) {
          toast.success(
            delta > 0
              ? `Saldo ajustado +${formatCents(Math.abs(delta), account.currency)}`
              : `Saldo ajustado −${formatCents(Math.abs(delta), account.currency)}`
          );
        }
      } else {
        const result = await correct({ accountId: account._id, newBalance: newBalanceCents });
        if (result.corrected) {
          toast.success(`Saldo corregido a ${formatCents(newBalanceCents, account.currency)}`);
        }
      }
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar saldo");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-lg bg-muted px-4 py-3 space-y-1">
        <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
          Saldo registrado
        </p>
        <p className="text-lg font-bold text-foreground tabular">
          {formatCents(account.balance, account.currency)}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="new-balance">
          {hasTx ? "Nuevo saldo" : "Corregir saldo"}{" "}
          <span aria-hidden="true" className="text-danger">*</span>
        </Label>
        <MoneyInput
          id="new-balance"
          placeholder="0"
          value={newBalanceStr}
          onChange={setNewBalanceStr}
        />
      </div>

      {isValid && !isNoOp && isReady && (
        <div
          className="rounded-lg border px-4 py-3 text-sm"
          style={{
            borderColor: delta > 0
              ? "color-mix(in oklch, var(--os-lime) 35%, transparent)"
              : "color-mix(in oklch, var(--os-magenta) 35%, transparent)",
            background: delta > 0
              ? "color-mix(in oklch, var(--os-lime) 10%, transparent)"
              : "color-mix(in oklch, var(--os-magenta) 10%, transparent)",
          }}
        >
          <p className="text-muted-foreground text-xs mb-1">
            {hasTx ? "Se registrará un movimiento" : "Sin transacciones · corrección directa"}
          </p>
          <p className="font-bold tabular" style={{
            color: delta > 0 ? "var(--os-lime)" : "var(--os-magenta)",
          }}>
            {delta > 0 ? "+" : "−"}{formatCents(Math.abs(delta), account.currency)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {hasTx ? "Reasignación bancaria" : "No se generará ningún registro"}
          </p>
        </div>
      )}

      {isValid && isNoOp && (
        <p className="text-sm text-muted-foreground text-center">Sin cambios en el saldo</p>
      )}

      <Button type="submit" className="w-full" disabled={loading || !isValid || isNoOp || !isReady}>
        {loading ? "Aplicando…" : hasTx ? "Confirmar ajuste" : "Corregir saldo"}
      </Button>
    </form>
  );
}
