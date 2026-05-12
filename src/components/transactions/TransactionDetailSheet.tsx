"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { AppSheet } from "@/components/ui/app-sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Select, SelectContent, SelectGroup, SelectItem,
  SelectLabel, SelectSeparator, SelectTrigger,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatCents, fromCents, toCents } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { Check, Pencil, Trash2, X, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  ArrowDownLeft, ArrowLeftRight, ArrowUpRight,
  CreditCard, HandCoins, Scale,
} from "lucide-react";
import type { LucideProps } from "lucide-react";
import { CategoryIcon } from "@/components/ui/category-icon";

type LucideIcon = React.ComponentType<LucideProps>;

// ── Config visual por tipo ─────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, {
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  amountColor: string;
  sign: string;
  label: string;
}> = {
  ingreso: {
    icon: ArrowDownLeft,
    iconColor: "var(--os-lime)",
    iconBg: "color-mix(in oklch, var(--os-lime) 18%, transparent)",
    amountColor: "var(--os-lime)",
    sign: "+",
    label: "Ingreso",
  },
  gasto: {
    icon: ArrowUpRight,
    iconColor: "var(--os-magenta)",
    iconBg: "color-mix(in oklch, var(--os-magenta) 16%, transparent)",
    amountColor: "var(--foreground)",
    sign: "−",
    label: "Gasto",
  },
  transferencia: {
    icon: ArrowLeftRight,
    iconColor: "var(--os-cyan)",
    iconBg: "color-mix(in oklch, var(--os-cyan) 16%, transparent)",
    amountColor: "var(--muted-foreground)",
    sign: "",
    label: "Transferencia",
  },
  pago_tarjeta: {
    icon: CreditCard,
    iconColor: "var(--os-orange)",
    iconBg: "color-mix(in oklch, var(--os-orange) 18%, transparent)",
    amountColor: "var(--foreground)",
    sign: "−",
    label: "Pago de tarjeta",
  },
  pago_deuda: {
    icon: HandCoins,
    iconColor: "var(--os-orange)",
    iconBg: "color-mix(in oklch, var(--os-orange) 18%, transparent)",
    amountColor: "var(--foreground)",
    sign: "−",
    label: "Pago de deuda",
  },
  ajuste: {
    icon: Scale,
    iconColor: "var(--muted-foreground)",
    iconBg: "color-mix(in oklch, var(--muted-foreground) 12%, transparent)",
    amountColor: "var(--muted-foreground)",
    sign: "",
    label: "Reasignación bancaria",
  },
};

const EDITABLE_TYPES = new Set(["ingreso", "gasto", "transferencia"]);

// ── Componente ────────────────────────────────────────────────────────────────

interface TransactionDetailSheetProps {
  transaction: Doc<"transactions"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Doc<"categories">[];
}

export function TransactionDetailSheet({
  transaction: tx,
  open,
  onOpenChange,
  categories,
}: TransactionDetailSheetProps) {
  const updateTx = useMutation(api.transactions.update);
  const removeTx = useMutation(api.transactions.remove);
  const accounts = useQuery(api.accounts.list);
  const cards    = useQuery(api.cards.list);

  const accountMap = Object.fromEntries((accounts ?? []).map((a) => [a._id, a.name]));
  const cardMap    = Object.fromEntries((cards    ?? []).map((c) => [c._id, { name: c.name, lastFourDigits: c.lastFourDigits }]));

  const [editing, setEditing]       = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [loading, setLoading]       = useState(false);

  // Estado del formulario de edición
  const [desc, setDesc]             = useState("");
  const [amount, setAmount]         = useState("");
  const [sourceId, setSourceId]     = useState("");   // "account:ID" | "card:ID" | ""
  const [date, setDate]             = useState("");
  const [categoryId, setCategoryId] = useState("");

  // Reiniciar cuando cambia la transacción seleccionada o se cierra el sheet
  const [prevTx, setPrevTx] = useState(tx);
  if (tx !== prevTx) {
    setPrevTx(tx);
    if (tx) {
      setDesc(tx.description);
      setAmount(String(fromCents(tx.amount)));
      setSourceId(
        tx.accountId ? `account:${tx.accountId}` :
        tx.cardId    ? `card:${tx.cardId}`        : ""
      );
      setDate(new Date(tx.date).toISOString().substring(0, 10));
      setCategoryId(tx.categoryId ?? "");
    }
    setEditing(false);
  }

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) setEditing(false);
  }

  if (!tx) return null;

  // Capturar en variable no-nullable para que los closures async mantengan el narrowing
  const currentTx = tx;

  const config = TYPE_CONFIG[currentTx.type] ?? TYPE_CONFIG.gasto;
  const Icon = config.icon;
  const canEdit = EDITABLE_TYPES.has(currentTx.type);

  const fullCat = currentTx.categoryId
    ? categories.find((c) => c._id === currentTx.categoryId)
    : undefined;
  const catIconBg    = fullCat ? `color-mix(in oklch, ${fullCat.color} 18%, transparent)` : config.iconBg;
  const catIconColor = fullCat ? fullCat.color : config.iconColor;

  const sourceAccount = currentTx.accountId ? accountMap[currentTx.accountId] : undefined;
  const sourceCard    = currentTx.cardId    ? cardMap[currentTx.cardId]        : undefined;

  // Decodificar sourceId para el Select
  const [sourceKind, sourceRawId] = sourceId.includes(":") ? sourceId.split(":") : ["", ""];
  const selectedAccount = sourceKind === "account" ? (accounts ?? []).find((a) => a._id === sourceRawId) : undefined;
  const selectedCard    = sourceKind === "card"    ? (cards    ?? []).find((c) => c._id === sourceRawId) : undefined;

  const accountList = (accounts ?? []).filter((a) => !a.archived);
  const cardList    = (cards    ?? []).filter((c) => !c.archived);

  // Solo mostrar categorías que correspondan al tipo de la transacción
  const filteredCategories = categories.filter(
    (c) => c.type === currentTx.type || c.type === "ambos"
  );

  async function handleSave() {
    if (!desc.trim()) {
      toast.error("La descripción es obligatoria");
      return;
    }

    // Transferencias: solo se editan descripción y notas
    if (currentTx.type === "transferencia") {
      setLoading(true);
      try {
        await updateTx({
          transactionId: currentTx._id,
          description: desc.trim(),
        });
        toast.success("Transferencia actualizada");
        setEditing(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al actualizar");
      } finally {
        setLoading(false);
      }
      return;
    }

    const amountNum = parseFloat(amount.replace(/[^0-9.]/g, ""));
    if (!amountNum || amountNum <= 0) {
      toast.error("El monto debe ser mayor que cero");
      return;
    }
    setLoading(true);
    try {
      await updateTx({
        transactionId: currentTx._id,
        amount:      toCents(amountNum),
        description: desc.trim(),
        date:        new Date(date).getTime(),
        categoryId:  categoryId ? (categoryId as Id<"categories">) : undefined,
        accountId:   sourceKind === "account" && sourceRawId ? (sourceRawId as Id<"accounts">) : undefined,
        cardId:      sourceKind === "card"    && sourceRawId ? (sourceRawId as Id<"cards">)    : undefined,
      });
      toast.success("Movimiento actualizado");
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    setLoading(true);
    try {
      await removeTx({ transactionId: currentTx._id });
      toast.success("Movimiento eliminado");
      setDeleteOpen(false);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <AppSheet
        open={open}
        onOpenChange={(o) => {
          if (!o) setEditing(false);
          onOpenChange(o);
        }}
        title={editing ? "Editar movimiento" : "Detalle del movimiento"}
      >
        <div className="space-y-5">

          {/* ── Cabecera: icono + monto ─────────────────────────────────────── */}
          {!editing && (
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
                  {config.sign}{formatCents(currentTx.amount, currentTx.currency)}
                </p>
                <p className="text-xs font-semibold text-muted-foreground mt-1">{config.label}</p>
              </div>
            </div>
          )}

          {/* ── Modo edición ────────────────────────────────────────────────── */}
          {editing ? (
            <div className="space-y-4">

              {/* Edición limitada para transferencias */}
              {currentTx.type === "transferencia" && (
                <div
                  className="rounded-xl p-3 text-xs text-muted-foreground"
                  style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
                >
                  Las cuentas, el monto y la fecha no se pueden modificar. Elimina y recrea la transferencia si hay errores en los datos principales.
                </div>
              )}

              {/* Monto — oculto para transferencias */}
              {currentTx.type !== "transferencia" && <div>
                <Label htmlFor="edit-amount" className="text-[12px] font-semibold text-foreground mb-2 block">
                  Monto <span aria-hidden="true" className="text-danger">*</span>
                </Label>
                <div
                  className="flex items-center justify-center rounded-xl focus-within:ring-2 focus-within:ring-ring"
                  style={{
                    background: "var(--surface-2)",
                    padding: "14px 16px",
                    "--ring": currentTx.type === "ingreso" ? "var(--os-lime)" : "var(--os-magenta)",
                  } as React.CSSProperties}
                >
                  <MoneyInput
                    id="edit-amount"
                    value={amount}
                    onChange={setAmount}
                    placeholder="0"
                    required
                    aria-required="true"
                    className="text-center border-none bg-transparent shadow-none focus-visible:ring-0 font-mono-num p-0 h-auto"
                    style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.025em" }}
                  />
                </div>
              </div>}

              {/* Cuenta o tarjeta — Select editable — oculto para transferencias */}
              {currentTx.type !== "transferencia" && <div>
                <Label htmlFor="edit-source" className="text-[12px] font-semibold text-foreground mb-2 block">
                  {currentTx.type === "ingreso" ? "Cuenta destino" : "Cuenta o tarjeta"}
                </Label>
                <Select value={sourceId} onValueChange={(v) => setSourceId(v ?? "")}>
                  <SelectTrigger id="edit-source" className="w-full" style={{ background: "var(--surface-2)" }}>
                    <span className="flex-1 text-left text-sm truncate">
                      {selectedAccount ? (
                        `${selectedAccount.name} · ${formatCents(selectedAccount.balance, selectedAccount.currency)}`
                      ) : selectedCard ? (
                        `${selectedCard.name} ····${selectedCard.lastFourDigits}`
                      ) : (
                        <span className="text-muted-foreground">Sin origen</span>
                      )}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Sin origen</SelectItem>
                    {accountList.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Cuentas</SelectLabel>
                        {accountList.map((a) => (
                          <SelectItem key={a._id} value={`account:${a._id}`}>
                            {a.name} · {formatCents(a.balance, a.currency)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    {currentTx.type === "gasto" && cardList.length > 0 && (
                      <>
                        {accountList.length > 0 && <SelectSeparator />}
                        <SelectGroup>
                          <SelectLabel>Tarjetas de crédito</SelectLabel>
                          {cardList.map((c) => (
                            <SelectItem key={c._id} value={`card:${c._id}`}>
                              {c.name} ····{c.lastFourDigits}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>}

              {/* Descripción */}
              <div>
                <Label htmlFor="edit-desc" className="text-[12px] font-semibold text-foreground mb-2 block">
                  Descripción <span aria-hidden="true" className="text-danger">*</span>
                </Label>
                <Input
                  id="edit-desc"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  required
                  aria-required="true"
                  style={{ background: "var(--surface-2)" }}
                />
              </div>

              {/* Fecha — oculta para transferencias */}
              {currentTx.type !== "transferencia" && <div>
                <Label htmlFor="edit-date" className="text-[12px] font-semibold text-foreground mb-2 block">
                  Fecha
                </Label>
                <DatePicker id="edit-date" value={date} onChange={setDate} required style={{ background: "var(--surface-2)" }} />
              </div>}

              {/* Categoría — Select — oculta para transferencias */}
              {currentTx.type !== "transferencia" && filteredCategories.length > 0 && (
                <div>
                  <Label htmlFor="edit-category" className="text-[12px] font-semibold text-foreground mb-2 block">
                    Categoría
                  </Label>
                  <Select value={categoryId} onValueChange={(v) => setCategoryId(v ?? "")}>
                    <SelectTrigger id="edit-category" className="w-full" style={{ background: "var(--surface-2)" }}>
                      {categoryId ? (
                        (() => {
                          const cat = filteredCategories.find((c) => c._id === categoryId);
                          return cat ? (
                            <span className="flex items-center gap-2 min-w-0">
                              <CategoryIcon
                                name={cat.icon}
                                aria-hidden
                                className="h-4 w-4 shrink-0"
                                style={{ color: cat.color }}
                                strokeWidth={1.8}
                              />
                              <span className="truncate">{cat.name}</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Sin categoría</span>
                          );
                        })()
                      ) : (
                        <span className="text-muted-foreground">Sin categoría</span>
                      )}
                    </SelectTrigger>
                    <SelectContent side="bottom">
                      <SelectItem value="">Sin categoría</SelectItem>
                      {filteredCategories.map((cat) => (
                        <SelectItem key={cat._id} value={cat._id}>
                          <CategoryIcon
                            name={cat.icon}
                            aria-hidden
                            className="h-[16px] w-[16px] shrink-0"
                            style={{ color: cat.color }}
                            strokeWidth={1.8}
                          />
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

          ) : (
            /* ── Modo vista: lista de campos ────────────────────────────────── */
            <div className="space-y-3">
              {/* Bloque especial para transferencias */}
              {currentTx.type === "transferencia" && (
                <div className="space-y-2">
                  {/* Badge de dirección */}
                  {currentTx.transferDirection && (
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={currentTx.transferDirection === "out" ? "destructive" : "secondary"}
                        className="gap-1"
                      >
                        {currentTx.transferDirection === "out" ? "↑ Salida" : "↓ Entrada"}
                      </Badge>
                    </div>
                  )}

                  {/* Bloque origen → destino */}
                  {currentTx.accountId && currentTx.toAccountId && (() => {
                    const fromName = currentTx.transferDirection === "in"
                      ? accountMap[currentTx.toAccountId]
                      : accountMap[currentTx.accountId];
                    const toName = currentTx.transferDirection === "in"
                      ? accountMap[currentTx.accountId]
                      : accountMap[currentTx.toAccountId];
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
                {/* Descripción */}
                <DetailRow label="Descripción" value={currentTx.description} />

                {/* Fecha */}
                <DetailRow label="Fecha" value={formatDate(currentTx.date)} />

                {/* Categoría con ícono */}
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

                {/* Cuenta origen (para gastos, ingresos, pago_deuda) */}
                {sourceAccount && currentTx.type !== "transferencia" && currentTx.type !== "pago_tarjeta" && (
                  <DetailRow
                    label={currentTx.type === "ingreso" ? "Cuenta destino" : "Cuenta"}
                    value={sourceAccount}
                  />
                )}

                {/* Para pago_tarjeta: tarjeta cargada + cuenta con la que se pagó */}
                {currentTx.type === "pago_tarjeta" && (
                  <>
                    {sourceCard && (
                      <DetailRow
                        label="Tarjeta"
                        value={`${sourceCard.name} ···${sourceCard.lastFourDigits}`}
                      />
                    )}
                    {sourceAccount && (
                      <DetailRow label="Pagado con" value={sourceAccount} />
                    )}
                  </>
                )}

                {/* Tarjeta para gastos directos en tarjeta */}
                {currentTx.type === "gasto" && sourceCard && (
                  <DetailRow
                    label="Tarjeta"
                    value={`${sourceCard.name} ···${sourceCard.lastFourDigits}`}
                  />
                )}

                {/* Estado */}
                <DetailRow
                  label="Estado"
                  value={
                    currentTx.status === "completada" ? "Completada"
                    : currentTx.status === "pendiente" ? "Pendiente"
                    : "Cancelada"
                  }
                />

                {/* Moneda */}
                <DetailRow label="Moneda" value={currentTx.currency} />

                {/* Recurrente */}
                {currentTx.isRecurring && (
                  <DetailRow label="Recurrente" value="Sí" />
                )}

                {/* Tags */}
                {currentTx.tags && currentTx.tags.length > 0 && (
                  <DetailRow label="Etiquetas">
                    <span className="flex flex-wrap justify-end gap-1">
                      {currentTx.tags.map((tag) => (
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

                {/* Notas */}
                {currentTx.notes && (
                  <DetailRow label="Notas" value={currentTx.notes} />
                )}
              </dl>
            </div>
          )}

          {/* ── Acciones ─────────────────────────────────────────────────────── */}
          {editing ? (
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleSave}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl font-bold transition-all active:scale-[0.98] disabled:opacity-60"
                style={{
                  padding: "13px 16px",
                  fontSize: 14,
                  background: "linear-gradient(135deg, var(--os-lime), var(--os-cyan))",
                  color: "var(--primary-foreground)",
                  border: "none",
                  cursor: loading ? "not-allowed" : "pointer",
                  boxShadow:
                    "0 6px 16px -4px color-mix(in oklch, var(--os-lime) 55%, transparent)",
                }}
              >
                <Check className="h-4 w-4" strokeWidth={2.5} />
                {loading ? "Guardando…" : "Guardar cambios"}
              </button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(false)}
                disabled={loading}
                className="gap-1.5"
              >
                <X className="h-4 w-4" />
                Cancelar
              </Button>
            </div>
          ) : (
            <div className="flex gap-2 pt-1">
              {canEdit && (
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 gap-2 font-semibold"
                  onClick={() => setEditing(true)}
                >
                  <Pencil className="h-4 w-4" />
                  Editar
                </Button>
              )}
              <Button
                type="button"
                variant="destructive"
                className={`gap-2 font-semibold ${canEdit ? "" : "flex-1"}`}
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                Eliminar
              </Button>
            </div>
          )}

        </div>
      </AppSheet>

      {/* ── Confirmación de eliminación ───────────────────────────────────────── */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este movimiento?</AlertDialogTitle>
            <AlertDialogDescription>
              {currentTx.type === "transferencia"
                ? "Se eliminarán ambas partes de la transferencia y se revertirán los saldos de las dos cuentas."
                : "Esta acción es irreversible. Se revertirá el saldo de la cuenta o tarjeta correspondiente."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading} />
            <AlertDialogAction onClick={handleDelete} disabled={loading}>
              {loading ? "Eliminando…" : "Sí, eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Sub-componente de fila de detalle ──────────────────────────────────────────

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
