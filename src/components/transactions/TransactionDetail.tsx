"use client";

import { useMemo } from "react";
import type { Doc } from "../../../convex/_generated/dataModel";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { Pencil, Trash2, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CategoryIcon } from "@/components/ui/category-icon";
import { TX_TYPE_CONFIG as TYPE_CONFIG } from "./tx-type-config";
import { useAppData } from "@/contexts/app-data";
import { canDeleteTx, canEditTx } from "./shared";

// La regla vive en ./shared: la comparten el detalle y las acciones de la lista

interface TransactionDetailProps {
  tx: Doc<"transactions">;
  onEdit: () => void;
  onDelete: () => void;
  // Permite al padre devolver el foco a este botón al salir del modo edición.
  editButtonRef?: React.RefObject<HTMLButtonElement | null>;
}

export function TransactionDetail({ tx, onEdit, onDelete, editButtonRef }: TransactionDetailProps) {
  const { accounts, cards, categories, goals } = useAppData();

  // Maps calculados una vez por cambio de listas, no en cada render
  const accountMap = useMemo(
    () => Object.fromEntries((accounts ?? []).map((a) => [a._id, a.name])),
    [accounts]
  );
  const cardMap = useMemo(
    () => Object.fromEntries(
      (cards ?? []).map((c) => [c._id, { name: c.name, lastFourDigits: c.lastFourDigits }])
    ),
    [cards]
  );

  const config = TYPE_CONFIG[tx.type] ?? TYPE_CONFIG.gasto;
  const Icon = config.icon;
  const canEdit = canEditTx(tx);
  // Una reasignación de saldo no se puede borrar: el backend lo rechaza siempre. El
  // botón estaba ahí y el usuario confirmaba un diálogo destructivo para recibir un error.
  const canDelete = canDeleteTx(tx);

  const fullCat = tx.categoryId ? (categories ?? []).find((c) => c._id === tx.categoryId) : undefined;
  const catIconBg    = fullCat ? `color-mix(in oklch, ${fullCat.color} 18%, transparent)` : config.iconBg;
  const catIconColor = fullCat ? fullCat.color : config.iconColor;

  const linkedGoal = tx.goalId ? (goals ?? []).find((g) => g._id === tx.goalId) : undefined;

  const sourceAccount = tx.accountId ? accountMap[tx.accountId] : undefined;
  const sourceCard    = tx.cardId    ? cardMap[tx.cardId]        : undefined;

  return (
    <div className="space-y-5">

      {/* ── Cabecera: icono + monto ─────────────────────────────────────── */}
      <div className="flex items-center gap-4 pb-1">
        <span
          className="flex shrink-0 items-center justify-center"
          style={{ width: 52, height: 52, borderRadius: 18, background: catIconBg, color: catIconColor }}
        >
          {fullCat
            ? <CategoryIcon name={fullCat.icon} className="h-[22px] w-[22px]" aria-hidden="true" />
            : <Icon className="h-[22px] w-[22px]" aria-hidden="true" />}
        </span>
        <div>
          <p
            className="font-mono-num"
            style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em", color: config.amountColor, lineHeight: 1 }}
          >
            {config.sign}{formatCents(tx.amount, tx.currency)}
          </p>
          <p className="text-xs font-semibold text-muted-foreground mt-1">{config.label}</p>
        </div>
      </div>

      {/* ── Lista de campos ─────────────────────────────────────────────── */}
      <div className="space-y-3">

        {/* Bloque especial para transferencias */}
        {tx.type === "transferencia" && (
          <div className="space-y-2">
            {tx.transferDirection && (
              <div className="flex items-center gap-2">
                <Badge
                  variant={tx.transferDirection === "out" ? "destructive" : "secondary"}
                  className="gap-1"
                >
                  {tx.transferDirection === "out" ? "↑ Salida" : "↓ Entrada"}
                </Badge>
              </div>
            )}

            {tx.accountId && tx.toAccountId && (() => {
              const fromName = tx.transferDirection === "in"
                ? accountMap[tx.toAccountId]
                : accountMap[tx.accountId];
              const toName = tx.transferDirection === "in"
                ? accountMap[tx.accountId]
                : accountMap[tx.toAccountId];
              return (
                <div className="rounded-[20px] bg-[var(--surface-2)] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Desde → Hacia
                  </p>
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <span className="truncate">{fromName ?? "Cuenta"}</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{toName ?? "Cuenta"}</span>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        <dl className="divide-y divide-border/60 overflow-hidden rounded-[20px] bg-[var(--surface-2)]">
          <DetailRow label="Descripción" value={tx.description} />
          <DetailRow label="Fecha" value={formatDate(tx.date)} />

          {fullCat && (
            <DetailRow label="Categoría">
              <span className="flex items-center justify-end gap-1.5">
                <CategoryIcon
                  name={fullCat.icon}
                  className="h-3.5 w-3.5 shrink-0"
                  style={{ color: fullCat.color }}
                  strokeWidth={1.8}
                  aria-hidden
                />
                <span>{fullCat.name}</span>
              </span>
            </DetailRow>
          )}

          {/* Cuenta origen — para gastos/ingresos/pago_deuda (no transferencia ni pago_tarjeta) */}
          {sourceAccount && tx.type !== "transferencia" && tx.type !== "pago_tarjeta" && (
            <DetailRow
              label={tx.type === "ingreso" ? "Cuenta destino" : "Cuenta"}
              value={sourceAccount}
            />
          )}

          {/* Pago de tarjeta: muestra la tarjeta cargada + la cuenta con la que se pagó */}
          {tx.type === "pago_tarjeta" && (
            <>
              {sourceCard && (
                <DetailRow label="Tarjeta" value={`${sourceCard.name} ···${sourceCard.lastFourDigits}`} />
              )}
              {sourceAccount && (
                <DetailRow label="Pagado con" value={sourceAccount} />
              )}
            </>
          )}

          {/* Tarjeta para gastos directos en tarjeta */}
          {tx.type === "gasto" && sourceCard && (
            <DetailRow label="Tarjeta" value={`${sourceCard.name} ···${sourceCard.lastFourDigits}`} />
          )}

          <DetailRow label="Moneda" value={tx.currency} />

          {/* Cambio de divisa: `createTransfer` guarda la tasa y el monto convertido en
              las dos piernas, y la UI los tiraba. Sin esto, una transferencia USD→COP
              se veía como dos movimientos con importes que no cuadraban entre sí. */}
          {tx.exchangeRate !== undefined && tx.exchangeRate > 0 && tx.toCurrency && (
            <DetailRow
              label="Tasa de cambio"
              // En la pierna de entrada se guarda la tasa inversa, y «1 COP = 0,00025 USD»
              // no se lee: por debajo de 1 se enuncia al revés.
              value={
                tx.exchangeRate >= 1
                  ? `1 ${tx.currency} = ${formatRate(tx.exchangeRate)} ${tx.toCurrency}`
                  : `1 ${tx.toCurrency} = ${formatRate(1 / tx.exchangeRate)} ${tx.currency}`
              }
            />
          )}
          {tx.toAmount !== undefined && tx.toCurrency && (
            <DetailRow label="Equivale a" value={formatCents(tx.toAmount, tx.toCurrency)} />
          )}

          {/* Meta vinculada: se guardaba al crear el gasto y no se mostraba en ninguna parte */}
          {linkedGoal && (
            <DetailRow label="Ahorro para">
              <span className="flex items-center justify-end gap-1.5">
                <span aria-hidden="true">{linkedGoal.icon}</span>
                <span>{linkedGoal.name}</span>
              </span>
            </DetailRow>
          )}

          {tx.isRecurring && <DetailRow label="Recurrente" value="Sí" />}

          {tx.tags && tx.tags.length > 0 && (
            <DetailRow label="Etiquetas">
              <span className="flex flex-wrap justify-end gap-1">
                {tx.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
                  >
                    {tag}
                  </span>
                ))}
              </span>
            </DetailRow>
          )}

          {tx.notes && <DetailRow label="Notas" value={tx.notes} />}
        </dl>
      </div>

      {/* ── Acciones ─────────────────────────────────────────────────────── */}
      {(canEdit || canDelete) && (
        <div className="flex gap-2 pt-1">
          {canEdit && (
            <Button
              type="button"
              ref={editButtonRef}
              variant="outline"
              className="flex-1 gap-2 font-semibold"
              onClick={onEdit}
            >
              <Pencil className="h-4 w-4" />
              Editar
            </Button>
          )}
          {canDelete && (
            <Button
              type="button"
              variant="destructive"
              className={`gap-2 font-semibold ${canEdit ? "" : "flex-1"}`}
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
              Eliminar
            </Button>
          )}
        </div>
      )}

      {/* Una reasignación no se borra: se corrige creando otra */}
      {!canDelete && (
        <p className="pt-1 text-center text-xs text-muted-foreground">
          Una reasignación de saldo no se elimina. Si el saldo quedó mal, ajústalo de nuevo desde la cuenta.
        </p>
      )}

    </div>
  );
}

// ── Fila de detalle: label a la izquierda, valor a la derecha ──────────────────

function DetailRow({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <dt className="text-xs font-semibold text-muted-foreground shrink-0 pt-px">{label}</dt>
      <dd className="text-sm text-right text-foreground min-w-0">
        {children ?? value}
      </dd>
    </div>
  );
}

/** Tasa legible: hasta 4 decimales, sin ceros de relleno. */
function formatRate(rate: number): string {
  return rate.toLocaleString("es-CO", { maximumFractionDigits: 4 });
}
