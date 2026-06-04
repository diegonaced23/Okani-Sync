"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/ui/money-input";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { toCents, fromCents, dateStrToTs, tsToDateStr } from "@/lib/money";
import { ACCOUNT_COLORS, CURRENCIES } from "@/lib/constants";
import { cn } from "@/lib/utils";

// ─── Emojis preset para metas ─────────────────────────────────────────────────

const GOAL_ICONS = [
  "🎯", "💻", "✈️", "🏠", "🚗", "📚",
  "🏖️", "💰", "🆘", "💍", "👶", "🏋️",
  "🎓", "🎸", "💊", "🌍", "🏦", "🎁",
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface GoalFormProps {
  editGoal?: Doc<"goals">;
  onSuccess?: () => void;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function GoalForm({ editGoal, onSuccess }: GoalFormProps) {
  const isEdit = !!editGoal;

  const createGoal = useMutation(api.goals.create);
  const updateGoal = useMutation(api.goals.update);
  const me = useQuery(api.users.getMe);

  const accounts = useQuery(api.accounts.list);

  const [name, setName]               = useState(editGoal?.name ?? "");
  const [description, setDescription] = useState(editGoal?.description ?? "");
  const [targetAmount, setTargetAmount] = useState(
    isEdit ? String(fromCents(editGoal!.targetAmount)) : ""
  );
  const [currency, setCurrency] = useState(editGoal?.currency ?? "COP");
  const [linkedAccountId, setLinkedAccountId] = useState<string>(
    editGoal?.linkedAccountId ?? ""
  );
  const [deadlineStr, setDeadlineStr] = useState(
    editGoal?.deadline ? tsToDateStr(editGoal.deadline) : ""
  );
  const [icon, setIcon]   = useState(editGoal?.icon ?? "🎯");
  const [color, setColor] = useState(editGoal?.color ?? ACCOUNT_COLORS[0]);
  const [notes, setNotes] = useState(editGoal?.notes ?? "");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(targetAmount) || 0;
    if (!name.trim()) { toast.error("El nombre es obligatorio"); return; }
    if (amount <= 0)  { toast.error("El monto objetivo debe ser mayor que cero"); return; }

    setLoading(true);
    try {
      if (isEdit) {
        await updateGoal({
          goalId: editGoal!._id as Id<"goals">,
          name: name.trim(),
          description: description.trim() || undefined,
          targetAmount: toCents(amount),
          currency,
          deadline: deadlineStr ? dateStrToTs(deadlineStr) : undefined,
          icon,
          color,
          notes: notes.trim() || undefined,
          linkedAccountId: linkedAccountId
            ? (linkedAccountId as Id<"accounts">)
            : undefined,
        });
        toast.success("Meta actualizada");
      } else {
        await createGoal({
          name: name.trim(),
          description: description.trim() || undefined,
          targetAmount: toCents(amount),
          currency: me?.currency ?? currency,
          deadline: deadlineStr ? dateStrToTs(deadlineStr) : undefined,
          icon,
          color,
          notes: notes.trim() || undefined,
          linkedAccountId: linkedAccountId
            ? (linkedAccountId as Id<"accounts">)
            : undefined,
        });
        toast.success("Meta creada");
      }
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Nombre */}
      <div className="space-y-1.5">
        <Label htmlFor="goal-name">¿Qué quieres lograr? <span aria-hidden className="text-danger">*</span></Label>
        <Input
          id="goal-name"
          placeholder="Ej: Laptop nueva, Fondo de emergencia, Viaje a Europa…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      {/* Icono */}
      <div className="space-y-1.5">
        <Label>Ícono</Label>
        <div className="flex flex-wrap gap-1.5">
          {GOAL_ICONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => setIcon(emoji)}
              className={cn(
                "h-10 w-10 rounded-xl text-xl flex items-center justify-center transition-all",
                icon === emoji ? "scale-110" : "hover:bg-muted"
              )}
              style={{
                background: icon === emoji ? `color-mix(in oklch, ${color} 18%, var(--surface-2))` : undefined,
                outline: icon === emoji ? `2px solid ${color}` : undefined,
                outlineOffset: 2,
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Color */}
      <div className="space-y-1.5">
        <Label>Color</Label>
        <div className="flex flex-wrap gap-2">
          {ACCOUNT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={cn(
                "h-7 w-7 rounded-full border-2 transition-transform",
                color === c ? "border-foreground scale-110" : "border-transparent"
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      {/* Monto objetivo */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="goal-target">Monto objetivo <span aria-hidden className="text-danger">*</span></Label>
          <MoneyInput
            id="goal-target"
            placeholder="0"
            value={targetAmount}
            onChange={setTargetAmount}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>Moneda</Label>
          <Select value={currency} onValueChange={(v) => { if (v) setCurrency(v); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
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
        <Label htmlFor="goal-desc">Descripción (opcional)</Label>
        <Input
          id="goal-desc"
          placeholder="Ej: MacBook Pro M4, Viaje con mi familia…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {/* Fecha límite */}
      <div className="space-y-1.5">
        <Label htmlFor="goal-deadline">Fecha límite (opcional)</Label>
        <DatePicker
          id="goal-deadline"
          value={deadlineStr}
          onChange={setDeadlineStr}
        />
        <p className="text-xs text-muted-foreground">
          Si defines una fecha, verás cuánto ahorrar por mes para llegar a tiempo.
        </p>
      </div>

      {/* Notas */}
      <div className="space-y-1.5">
        <Label htmlFor="goal-notes">Notas (opcional)</Label>
        <Textarea
          id="goal-notes"
          rows={2}
          placeholder="Motivación, detalles del objetivo…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {/* Cuenta de ahorro vinculada */}
      {(accounts ?? []).filter((a) => a.type === "ahorros").length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="goal-linked-account" className="flex items-center gap-1.5">
            <Link2 className="h-3.5 w-3.5" style={{ color: "var(--os-cyan)" }} />
            Vincular a cuenta de ahorro (opcional)
          </Label>
          <Select
            value={linkedAccountId}
            onValueChange={(v) => setLinkedAccountId(v ?? "")}
          >
            <SelectTrigger id="goal-linked-account">
              <SelectValue placeholder="Sin cuenta vinculada" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Sin cuenta vinculada</SelectItem>
              {(accounts ?? [])
                .filter((a) => a.type === "ahorros")
                .map((a) => (
                  <SelectItem key={a._id} value={a._id}>
                    {a.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          {linkedAccountId && (
            <p className="text-xs text-muted-foreground">
              El progreso de esta meta reflejará automáticamente el saldo de esa cuenta. No se necesitan abonos manuales.
            </p>
          )}
        </div>
      )}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear meta"}
      </Button>
    </form>
  );
}
