"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Trash2, type LucideIcon } from "lucide-react";
import { AppSheet } from "@/components/ui/app-sheet";
import { ProgressRing } from "@/components/ui/progress-ring";
import { SwipeRow } from "@/components/ui/swipe-row";
import { HoldToConfirmButton } from "@/components/ui/hold-to-confirm-button";
import { EASE_OUT_EXPO, GLASS_SURFACE, tint } from "@/lib/ios";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { DEBT_TYPE_META, dueLabel, formatFull, progressOf, toneOf, type Obligation } from "./shared";

// ─── Encabezado ───────────────────────────────────────────────────────────────

export function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-ml-1 flex items-center gap-1 rounded-full px-1 py-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {label}
    </button>
  );
}

/** Anillo grande con el progreso, el saldo y los datos clave de la deuda o el préstamo. */
export function DetailHero({ o, startDate }: { o: Obligation; startDate: number }) {
  const reduce = useReducedMotion();
  const progress = progressOf(o);
  const tone = toneOf(o);
  const paid = o.status === "pagada";
  const due = !paid && o.dueDate ? dueLabel(o.dueDate) : null;
  const TypeIcon = o.debtType ? DEBT_TYPE_META[o.debtType].icon : null;
  const isDebt = o.kind === "debt";

  const facts: { label: string; value: string; danger?: boolean }[] = [
    ...(o.monthlyPayment ? [{ label: "Cuota", value: formatCents(o.monthlyPayment, o.currency) }] : []),
    ...(o.interestRate !== undefined ? [{ label: "Tasa", value: `${(o.interestRate * 100).toLocaleString("es-CO", { maximumFractionDigits: 2 })}% m.v.` }] : []),
    ...(o.dueDate ? [{ label: paid ? "Fecha límite" : due?.overdue ? "Venció" : "Vence", value: formatFull(o.dueDate), danger: due?.overdue }] : []),
    { label: isDebt ? "Desde" : "Prestado", value: formatFull(startDate) },
  ];

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
      className={cn("relative overflow-hidden rounded-[30px] px-5 pb-5 pt-6 text-center", GLASS_SURFACE)}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 left-1/2 h-48 w-64 -translate-x-1/2 rounded-full opacity-25 blur-3xl"
        style={{ background: tone }}
      />

      <div className="relative mx-auto w-fit">
        <ProgressRing
          value={progress}
          color={tone}
          size={152}
          stroke={12}
          label={`${Math.round(progress * 100)}% ${isDebt ? "pagado" : "cobrado"}`}
        >
          <span className="flex flex-col items-center leading-none">
            <span className="font-mono-num text-[34px] font-extrabold tabular-nums text-foreground">
              {Math.round(progress * 100)}%
            </span>
            <span className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {isDebt ? "pagado" : "cobrado"}
            </span>
          </span>
        </ProgressRing>
      </div>

      <div className="relative mt-4 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
        {TypeIcon && <TypeIcon className="h-3.5 w-3.5" aria-hidden="true" />}
        <span className="truncate">
          {isDebt ? o.counterpart : `A ${o.counterpart}`}
          {o.debtType && ` · ${DEBT_TYPE_META[o.debtType].label}`}
        </span>
      </div>
      <h1 className="relative mt-0.5 truncate text-xl font-extrabold tracking-tight text-foreground">{o.name}</h1>

      <p className="relative mt-3 font-mono-num text-[32px] font-extrabold leading-none tracking-tight text-foreground tabular-nums">
        {paid ? (isDebt ? "Saldada" : "Cobrado") : formatCents(o.currentBalance, o.currency)}
      </p>
      <p className="relative mt-1.5 text-xs text-muted-foreground">
        {paid
          ? `${formatCents(o.originalAmount, o.currency)} ${isDebt ? "pagados" : "devueltos"} en total`
          : `${isDebt ? "pendientes" : "por cobrar"} de ${formatCents(o.originalAmount, o.currency)}`}
      </p>

      {due && (
        <span
          className={cn(
            "relative mt-3 inline-block rounded-full px-3 py-1 text-xs font-bold",
            due.overdue ? "text-[var(--os-magenta)]" : due.urgent ? "text-[var(--warning-text)]" : "bg-muted/70 text-muted-foreground",
          )}
          style={due.overdue
            ? { background: tint("var(--os-magenta)", 15) }
            : due.urgent ? { background: tint("var(--os-orange)", 18) } : undefined}
        >
          {due.text}
        </span>
      )}

      <dl className="relative mt-4 grid grid-cols-2 gap-2 text-left">
        {facts.map((f) => (
          <div key={f.label} className="rounded-[16px] bg-background/40 px-3 py-2.5 dark:bg-white/5">
            <dt className="text-[11px] font-semibold text-muted-foreground">{f.label}</dt>
            <dd className={cn("mt-0.5 truncate text-sm font-bold tabular-nums", f.danger ? "text-[var(--os-magenta)]" : "text-foreground")}>
              {f.value}
            </dd>
          </div>
        ))}
      </dl>
    </motion.section>
  );
}

// ─── Acciones ─────────────────────────────────────────────────────────────────

/** Botón circular con etiqueta debajo, como las acciones de Wallet */
export function ActionButton({
  icon: Icon,
  label,
  onClick,
  primary,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex flex-1 flex-col items-center gap-1.5 disabled:opacity-40"
    >
      <span className={cn(
        "flex h-12 w-12 items-center justify-center rounded-full transition-transform group-active:scale-90",
        primary
          ? "bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-[0_8px_20px_-8px_rgb(16_185_129/0.9)]"
          : cn("text-foreground", GLASS_SURFACE),
      )}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="text-xs font-semibold text-foreground">{label}</span>
    </button>
  );
}

// ─── Historial de abonos ──────────────────────────────────────────────────────

export interface PaymentItem {
  id: string;
  amount: number;
  currency: string;
  date: number;
  notes?: string;
}

const monthFmt = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" });
const monthAbbr = new Intl.DateTimeFormat("es-CO", { month: "short" });

/**
 * Abonos agrupados por mes, como una línea de tiempo. Deslizar uno a la izquierda
 * permite borrarlo (con confirmación manteniendo presionado).
 */
export function PaymentHistory({
  items,
  kind,
  onDelete,
}: {
  items: PaymentItem[] | undefined;
  kind: "debt" | "loan";
  onDelete: (id: string) => Promise<void>;
}) {
  const reduce = useReducedMotion();
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<PaymentItem | null>(null);
  const [busy, setBusy] = useState(false);

  if (items === undefined) {
    return <div className={cn("h-40 animate-pulse rounded-[24px]", GLASS_SURFACE)} />;
  }
  if (items.length === 0) {
    return (
      <div className={cn("rounded-[24px] px-6 py-8 text-center", GLASS_SURFACE)}>
        <p className="text-sm font-semibold text-foreground">{kind === "debt" ? "Aún no hay abonos" : "Aún no te han devuelto nada"}</p>
        <p className="mt-1 text-xs text-muted-foreground">Cada abono que registres aparece aquí.</p>
      </div>
    );
  }

  const groups: { key: string; label: string; items: PaymentItem[]; total: number }[] = [];
  for (const p of items) {
    const d = new Date(p.date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    let g = groups[groups.length - 1];
    if (g?.key !== key) {
      const label = monthFmt.format(d);
      g = { key, label: label.charAt(0).toUpperCase() + label.slice(1), items: [], total: 0 };
      groups.push(g);
    }
    g.items.push(p);
    g.total += p.amount;
  }

  async function confirmDelete() {
    if (!confirming) return;
    setBusy(true);
    try {
      await onDelete(confirming.id);
      setConfirming(null);
    } finally {
      setBusy(false);
    }
  }

  let index = 0;
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g.key} className="space-y-2" aria-label={g.label}>
          <div className="flex items-baseline justify-between px-1">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{g.label}</h3>
            <span className="font-mono-num text-xs font-bold tabular-nums text-muted-foreground">
              {formatCents(g.total, g.items[0].currency)}
            </span>
          </div>
          <div className={cn("rounded-[24px] p-1.5", GLASS_SURFACE)}>
            <ul className="space-y-0.5">
              <AnimatePresence initial={false}>
                {g.items.map((p) => {
                  const i = index++;
                  return (
                    <motion.li
                      key={p.id}
                      layout={!reduce}
                      initial={reduce ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.35, ease: EASE_OUT_EXPO, delay: Math.min(i, 10) * 0.03 }}
                      className="list-none overflow-hidden rounded-[16px]"
                    >
                      <SwipeRow
                        id={p.id}
                        openId={openId}
                        setOpenId={setOpenId}
                        actions={[{
                          key: "delete",
                          label: "Borrar",
                          icon: Trash2,
                          className: "bg-[var(--os-magenta-2)]",
                          onAction: () => setConfirming(p),
                        }]}
                      >
                        <div className="flex items-center gap-3 px-3 py-2.5">
                          <span className="relative flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-[11px] bg-muted/70 leading-none">
                            <span className="text-[13px] font-extrabold tabular-nums text-foreground">{new Date(p.date).getDate()}</span>
                            <span className="text-[8px] font-bold uppercase text-muted-foreground">
                              {monthAbbr.format(p.date).replace(".", "")}
                            </span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-foreground">
                              {kind === "debt" ? "Abono" : "Te devolvió"}
                            </span>
                            {p.notes && <span className="block truncate text-xs text-muted-foreground">{p.notes}</span>}
                          </span>
                          <span className="shrink-0 font-mono-num text-sm font-bold tabular-nums text-lime-text">
                            {kind === "debt" ? "−" : "+"}{formatCents(p.amount, p.currency)}
                          </span>
                        </div>
                      </SwipeRow>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          </div>
        </section>
      ))}

      <AppSheet
        open={confirming !== null}
        onOpenChange={(open) => { if (!open) setConfirming(null); }}
        title="Borrar abono"
        description={confirming ? `${formatCents(confirming.amount, confirming.currency)} del ${formatFull(confirming.date)}` : undefined}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {kind === "debt"
              ? "El saldo de la deuda vuelve a subir en ese monto, se borra el movimiento y, si salió de una cuenta, se le devuelve."
              : "El préstamo vuelve a deber ese monto, se borra el movimiento y, si entró a una cuenta, se le descuenta."}
          </p>
          <HoldToConfirmButton label="Mantén para borrar" busyLabel="Borrando…" busy={busy} onConfirm={confirmDelete} />
        </div>
      </AppSheet>
    </div>
  );
}
