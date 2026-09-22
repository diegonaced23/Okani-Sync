"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { motion, useReducedMotion } from "framer-motion";
import { Pencil, Receipt, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { AppSheet, AppSheetFooter } from "@/components/ui/app-sheet";
import { CategoryIcon } from "@/components/ui/category-icon";
import { HoldToConfirmButton } from "@/components/ui/hold-to-confirm-button";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Skeleton } from "@/components/ui/skeleton";
import { EASE_OUT_EXPO, tint } from "@/lib/ios";
import { formatCents, formatMonth } from "@/lib/money";
import { STATE_TEXT, STATE_TONE, type Budget, paceOf, ratioOf, stateOf, thresholdOf, toneOf } from "./shared";
import { errorMessage } from "@/lib/errorMessage";

/**
 * Detalle del presupuesto: cómo va el gasto contra el ritmo del mes y en qué se
 * fue exactamente. Los movimientos son lo que antes obligaba a salir a la lista
 * de transacciones y filtrar a mano.
 */
export function BudgetDetailSheet({
  budget,
  open,
  onOpenChange,
  nowMs,
  onEdit,
  onDeleted,
}: {
  budget: Budget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nowMs: number;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  return (
    <AppSheet
      open={open && budget !== null}
      onOpenChange={onOpenChange}
      title={budget?.categoryName ?? "Presupuesto"}
      description={budget ? formatMonth(budget.month) : undefined}
      footer
    >
      {budget && <DetailBody key={budget._id} budget={budget} nowMs={nowMs} onEdit={onEdit} onDeleted={onDeleted} />}
    </AppSheet>
  );
}

function DetailBody({
  budget,
  nowMs,
  onEdit,
  onDeleted,
}: {
  budget: Budget;
  nowMs: number;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const reduce = useReducedMotion();
  const remove = useMutation(api.budgets.remove);
  const [busy, setBusy] = useState(false);
  const movements = useQuery(api.transactions.listByCategoryMonth, {
    categoryId: budget.categoryId,
    month: budget.month,
  });

  const ratio = ratioOf(budget);
  const state = stateOf(budget);
  const tone = toneOf(budget);
  const threshold = thresholdOf(budget);
  const pace = paceOf(budget.month, budget.spent, budget.amount, nowMs);
  const remaining = budget.amount - budget.spent;

  async function handleDelete() {
    setBusy(true);
    try {
      await remove({ budgetId: budget._id });
      toast.success(`Presupuesto de «${budget.categoryName ?? "la categoría"}» eliminado`);
      onDeleted();
    } catch (err) {
      setBusy(false);
      toast.error(errorMessage(err, "No se pudo eliminar"));
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabecera con el anillo y el estado */}
      <div
        className="relative overflow-hidden rounded-[24px] border border-white/40 px-4 pb-4 pt-5 text-center dark:border-white/10"
        style={{ background: `linear-gradient(160deg, ${tint(tone, 14)}, transparent 70%)` }}
      >
        <div className="relative mx-auto w-fit">
          <ProgressRing
            value={Math.min(ratio, 1)}
            color={tone}
            size={104}
            stroke={9}
            label={`${Math.round(ratio * 100)}% gastado`}
          >
            <span className="flex flex-col items-center leading-none">
              <span className="font-mono-num text-2xl font-extrabold tabular-nums text-foreground">
                {Math.round(ratio * 100)}%
              </span>
              <span className="mt-1 text-[10px] font-semibold text-muted-foreground">gastado</span>
            </span>
          </ProgressRing>
        </div>

        <p className="mt-3 font-mono-num text-[26px] font-extrabold leading-none tracking-tight text-foreground tabular-nums">
          {formatCents(budget.spent, budget.currency)}
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          de {formatCents(budget.amount, budget.currency)} ·{" "}
          {remaining < 0 ? (
            <strong style={{ color: "var(--os-magenta)" }}>
              {formatCents(-remaining, budget.currency)} por encima
            </strong>
          ) : (
            <strong className="text-foreground">{formatCents(remaining, budget.currency)} disponibles</strong>
          )}
        </p>

        <span
          className="mt-3 inline-block rounded-full px-3 py-1 text-xs font-bold"
          style={{ background: tint(STATE_TONE[state], 18), color: STATE_TEXT[state] }}
        >
          {state === "over" ? "Excedido" : state === "warn" ? `Pasó el ${threshold}%` : "Al día"}
        </span>
      </div>

      {/* Ritmo del mes */}
      <div className="grid grid-cols-2 gap-2">
        <Stat
          label={pace.closed ? "Mes cerrado" : `Día ${pace.day} de ${pace.days}`}
          value={pace.closed ? "—" : `${Math.round(pace.elapsed * 100)}%`}
          hint={pace.closed ? "Ya no cambia" : "del mes transcurrido"}
        />
        <Stat
          label="Proyección"
          value={formatCents(pace.projected, budget.currency)}
          hint={pace.closed ? "gasto final" : pace.onTrack ? "cerrarías dentro" : "cerrarías por encima"}
          tone={pace.closed ? undefined : pace.onTrack ? "var(--os-lime-text)" : "var(--os-orange-text)"}
        />
        {!pace.closed && pace.perDayLeft > 0 && (
          <Stat
            label="Margen diario"
            value={formatCents(pace.perDayLeft, budget.currency)}
            hint={`para los ${pace.days - pace.day} días que quedan`}
          />
        )}
        <Stat
          label="Alerta"
          value={`${threshold}%`}
          hint={`al gastar ${formatCents(Math.round((budget.amount * threshold) / 100), budget.currency)}`}
        />
      </div>

      {budget.recurring && (
        <p className="flex items-center gap-2 rounded-[16px] bg-[color-mix(in_oklch,var(--os-cyan)_10%,transparent)] px-3 py-2.5 text-xs text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--os-cyan-text)" }} aria-hidden="true" />
          Se vuelve a crear el 1° de cada mes con el mismo monto.
        </p>
      )}

      {budget.notes && (
        <div className="space-y-1.5">
          <p className="px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Nota</p>
          <p className="rounded-[16px] bg-[var(--surface-2)] px-3 py-2.5 text-sm text-foreground">{budget.notes}</p>
        </div>
      )}

      {/* Movimientos de la categoría en el mes */}
      <div className="space-y-2">
        <p className="px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          En qué se fue
        </p>

        {movements === undefined ? (
          <div className="space-y-1.5">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-[14px]" />)}
          </div>
        ) : movements.length === 0 ? (
          <p className="flex items-center gap-2 rounded-[16px] bg-[var(--surface-2)] px-3 py-3 text-sm text-muted-foreground">
            <Receipt className="h-4 w-4 shrink-0" aria-hidden="true" />
            Todavía no hay movimientos en esta categoría.
          </p>
        ) : (
          <ul className="space-y-1">
            {movements.map((t, i) => (
              <motion.li
                key={t._id}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: EASE_OUT_EXPO, delay: Math.min(i, 10) * 0.03 }}
                className="flex items-center gap-3 rounded-[14px] bg-[var(--surface-2)] px-3 py-2.5"
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  style={{ background: tint(budget.categoryColor ?? tone, 14), color: budget.categoryColor ?? tone }}
                >
                  <CategoryIcon name={budget.categoryIcon ?? "tag"} className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-foreground">{t.description}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {new Date(t.date).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
                    {t.status === "pendiente" && " · pendiente"}
                  </span>
                </span>
                <span className="shrink-0 font-mono-num text-sm font-bold tabular-nums text-foreground">
                  {formatCents(t.amount, t.currency)}
                </span>
              </motion.li>
            ))}
          </ul>
        )}
        {movements !== undefined && movements.length >= 100 && (
          <p className="px-1 text-[11px] text-muted-foreground/80">
            Se muestran los 100 movimientos más recientes del mes.
          </p>
        )}
      </div>

      {/* Eliminar vive aquí, no en el pie: un diálogo de confirmación encima de la
          hoja abierta se pelearía con ella por el foco. Mantener presionado basta. */}
      <div className="space-y-2 pt-2">
        <div className="os-hairline" />
        <HoldToConfirmButton
          label="Mantén para eliminar"
          busyLabel="Eliminando…"
          busy={busy}
          onConfirm={handleDelete}
        />
        <p className="px-1 text-center text-[11px] text-muted-foreground">
          Se borra solo el límite del mes; tus movimientos no se tocan.
        </p>
      </div>

      <AppSheetFooter>
        <button
          type="button"
          onClick={onEdit}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-gradient-to-r from-emerald-400 to-teal-500 text-[15px] font-bold text-white shadow-[0_10px_24px_-10px_rgb(16_185_129/0.8)] transition-transform active:scale-[0.98]"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" /> Editar presupuesto
        </button>
      </AppSheetFooter>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: string;
}) {
  return (
    <div className="rounded-[16px] bg-[var(--surface-2)] px-3 py-2.5">
      <p className="truncate text-[11px] font-semibold text-muted-foreground">{label}</p>
      <p
        className="mt-0.5 truncate font-mono-num text-[15px] font-bold tabular-nums text-foreground"
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </p>
      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}
