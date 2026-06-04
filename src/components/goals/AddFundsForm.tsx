"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { toast } from "sonner";
import { toCents, fromCents, formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

interface AddFundsFormProps {
  goal: Doc<"goals">;
  onSuccess?: () => void;
}

type Mode = "abonar" | "retirar";

export function AddFundsForm({ goal, onSuccess }: AddFundsFormProps) {
  const addFunds = useMutation(api.goals.addFunds);

  const [mode, setMode]     = useState<Mode>("abonar");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
  const percent = goal.targetAmount > 0
    ? Math.min(100, (goal.currentAmount / goal.targetAmount) * 100)
    : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseFloat(amount) || 0;
    if (value <= 0) { toast.error("El monto debe ser mayor que cero"); return; }

    const delta = toCents(value) * (mode === "abonar" ? 1 : -1);
    setLoading(true);
    try {
      await addFunds({ goalId: goal._id as Id<"goals">, delta });
      const action = mode === "abonar" ? "Abono registrado" : "Retiro registrado";
      toast.success(action);
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Resumen actual */}
      <div
        className="rounded-xl p-4 space-y-2"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">{goal.icon}</span>
          <div>
            <p className="font-semibold text-foreground">{goal.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatCents(goal.currentAmount, goal.currency)} de {formatCents(goal.targetAmount, goal.currency)}
            </p>
          </div>
        </div>

        {/* Barra de progreso */}
        <div
          role="progressbar"
          aria-valuenow={Math.round(percent)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${goal.name}: ${Math.round(percent)}% completado`}
          className="h-2 w-full rounded-full overflow-hidden"
          style={{ background: "var(--muted)" }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${percent}%`,
              background: `linear-gradient(90deg, ${goal.color}, color-mix(in oklch, ${goal.color} 70%, var(--os-cyan)))`,
            }}
          />
        </div>

        {remaining > 0 && (
          <p className="text-xs text-muted-foreground">
            Falta: <span className="font-medium text-foreground">{formatCents(remaining, goal.currency)}</span>
          </p>
        )}
      </div>

      {/* Selector de modo */}
      <div
        className="flex rounded-[14px] p-1"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
      >
        {(["abonar", "retirar"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className="flex-1 py-2 text-[13px] capitalize"
            style={{
              borderRadius: 10,
              background: mode === m ? "var(--surface)" : "transparent",
              color: mode === m ? "var(--foreground)" : "var(--muted-foreground)",
              fontWeight: mode === m ? 700 : 600,
              boxShadow: mode === m ? "var(--shadow-sm)" : "none",
              transition: "all 0.2s cubic-bezier(0.34,1.56,0.64,1)",
            }}
          >
            {m === "abonar" ? "Abonar" : "Retirar"}
          </button>
        ))}
      </div>

      {/* Formulario */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="funds-amount">
            {mode === "abonar" ? "¿Cuánto quieres abonar?" : "¿Cuánto quieres retirar?"}
          </Label>
          <MoneyInput
            id="funds-amount"
            placeholder="0"
            value={amount}
            onChange={setAmount}
            required
          />
          {mode === "abonar" && remaining > 0 && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors"
              onClick={() => setAmount(String(fromCents(remaining)))}
            >
              Completar meta ({formatCents(remaining, goal.currency)})
            </button>
          )}
        </div>

        <Button
          type="submit"
          className={cn("w-full", mode === "abonar"
            ? "bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-500 hover:to-teal-600 text-white border-0"
            : ""
          )}
          variant={mode === "retirar" ? "outline" : "default"}
          disabled={loading}
        >
          {loading ? "Guardando…" : mode === "abonar" ? "Registrar abono" : "Registrar retiro"}
        </Button>
      </form>
    </div>
  );
}
