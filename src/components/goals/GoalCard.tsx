"use client";

import { Pencil, Trash2, Plus, CheckCircle2 } from "lucide-react";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Doc } from "../../../convex/_generated/dataModel";

interface GoalCardProps {
  goal: Doc<"goals">;
  nowMs: number;
  onEdit: () => void;
  onDelete: () => void;
  onAddFunds: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deadlineLabel(deadlineMs: number, nowMs: number): { text: string; urgent: boolean } {
  const msLeft = deadlineMs - nowMs;
  const daysLeft = Math.ceil(msLeft / 86_400_000);
  if (daysLeft < 0) return { text: "Fecha límite vencida", urgent: true };
  if (daysLeft === 0) return { text: "Vence hoy", urgent: true };
  if (daysLeft === 1) return { text: "Queda 1 día", urgent: true };
  if (daysLeft <= 7) return { text: `Quedan ${daysLeft} días`, urgent: true };
  const d = new Date(deadlineMs);
  const formatted = d.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
  return { text: `Hasta ${formatted}`, urgent: false };
}

function monthlyNeeded(remaining: number, deadline: number, nowMs: number): number | null {
  const msLeft = deadline - nowMs;
  const months = msLeft / (30.44 * 86_400_000); // promedio mensual
  if (months <= 0) return null;
  return Math.ceil(remaining / months);
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function GoalCard({ goal, nowMs, onEdit, onDelete, onAddFunds }: GoalCardProps) {
  const percent = goal.targetAmount > 0
    ? Math.min(100, (goal.currentAmount / goal.targetAmount) * 100)
    : 0;
  const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
  const isCompleted = goal.status === "completada";

  const dl = goal.deadline ? deadlineLabel(goal.deadline, nowMs) : null;
  const monthly = (!isCompleted && goal.deadline && remaining > 0)
    ? monthlyNeeded(remaining, goal.deadline, nowMs)
    : null;

  return (
    <div
      className="rounded-xl border bg-card p-4 space-y-3"
      style={{
        borderColor: isCompleted
          ? "color-mix(in oklch, var(--os-lime) 30%, var(--border))"
          : `${goal.color}44`,
        background: isCompleted
          ? "color-mix(in oklch, var(--os-lime) 6%, var(--card))"
          : `color-mix(in oklch, ${goal.color} 4%, var(--card))`,
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Emoji icon */}
          <span
            className="flex shrink-0 items-center justify-center text-xl"
            style={{
              width: 44, height: 44, borderRadius: 14,
              background: `color-mix(in oklch, ${goal.color} 16%, var(--surface-2))`,
            }}
          >
            {goal.icon}
          </span>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="font-semibold text-foreground truncate">{goal.name}</p>
              {isCompleted && (
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-[var(--os-lime)] shrink-0">
                  <CheckCircle2 className="h-3 w-3" />
                  Completada
                </span>
              )}
            </div>
            {goal.description && (
              <p className="text-xs text-muted-foreground truncate">{goal.description}</p>
            )}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-0.5 shrink-0">
          {!isCompleted && (
            <button
              type="button"
              onClick={onAddFunds}
              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Abonar a esta meta"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Editar meta"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-danger transition-colors"
            aria-label="Eliminar meta"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── Barra de progreso ───────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <div
          role="progressbar"
          aria-valuenow={Math.round(percent)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${goal.name}: ${Math.round(percent)}% completado`}
          className="h-2.5 w-full rounded-full overflow-hidden"
          style={{ background: "var(--muted)" }}
        >
          <div
            className={cn("h-full rounded-full transition-all")}
            style={{
              width: `${percent}%`,
              background: isCompleted
                ? "var(--os-lime)"
                : `linear-gradient(90deg, ${goal.color}, color-mix(in oklch, ${goal.color} 70%, var(--os-cyan)))`,
            }}
          />
        </div>

        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            Ahorrado:{" "}
            <span className="font-semibold text-foreground">
              {formatCents(goal.currentAmount, goal.currency)}
            </span>
          </span>
          <span className="font-semibold" style={{ color: goal.color }}>
            {Math.round(percent)}%
          </span>
        </div>
      </div>

      {/* ── Footer: objetivo + deadline ─────────────────────────────────────── */}
      <div
        className="flex items-center justify-between text-xs text-muted-foreground pt-1"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <span>
          Objetivo:{" "}
          <span className="font-semibold text-foreground">
            {formatCents(goal.targetAmount, goal.currency)}
          </span>
        </span>

        <div className="flex flex-col items-end gap-0.5">
          {dl && (
            <span className={cn("font-medium", dl.urgent ? "text-warning" : "text-muted-foreground")}>
              {dl.text}
            </span>
          )}
          {monthly !== null && (
            <span className="text-[10px] text-muted-foreground">
              ~{formatCents(monthly, goal.currency)}/mes
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
