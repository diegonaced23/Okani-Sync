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

// Tipos con edición habilitada en el detalle
const EDITABLE_TYPES = new Set(["ingreso", "gasto", "transferencia", "gasto_tarjeta"]);

interface TransactionDetailProps {
  tx: Doc<"transactions">;
  onEdit: () => void;
  onDelete: () => void;
}

export function TransactionDetail({ tx, onEdit, onDelete }: TransactionDetailProps) {
  const { accounts, cards, categories } = useAppData();

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
  const canEdit = EDITABLE_TYPES.has(tx.type);

  const fullCat = tx.categoryId ? (categories ?? []).find((c) => c._id === tx.categoryId) : undefined;
  const catIconBg    = fullCat ? `color-mix(in oklch, ${fullCat.color} 18%, transparent)` : config.iconBg;
  const catIconColor = fullCat ? fullCat.color : config.iconColor;

  const sourceAccount = tx.accountId ? accountMap[tx.accountId] : undefined;
  const sourceCard    = tx.cardId    ? cardMap[tx.cardId]        : undefined;

  return (
    <div className="space-y-5">

      {/* ── Cabecera: icono + monto ─────────────────────────────────────── */}
      <div className="flex items-center gap-4 pb-1">
        <span
          className="flex shrink-0 items-center justify-center"
          style={{ width: 52, height: 52, borderRadius: 16, background: catIconBg, color: catIconColor }}
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
                <div
                  className="rounded-xl p-3"
                  style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
                >
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

        <dl
          className="rounded-xl divide-y"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", overflow: "hidden" }}
        >
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

          <DetailRow
            label="Estado"
            value={
              tx.status === "completada" ? "Completada"
              : tx.status === "pendiente" ? "Pendiente"
              : "Cancelada"
            }
          />
          <DetailRow label="Moneda" value={tx.currency} />

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
      <div className="flex gap-2 pt-1">
        {canEdit && (
          <Button
            type="button"
            variant="outline"
            className="flex-1 gap-2 font-semibold"
            onClick={onEdit}
          >
            <Pencil className="h-4 w-4" />
            Editar
          </Button>
        )}
        <Button
          type="button"
          variant="destructive"
          className={`gap-2 font-semibold ${canEdit ? "" : "flex-1"}`}
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
          Eliminar
        </Button>
      </div>

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
