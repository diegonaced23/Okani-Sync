"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
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
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatCents, fromCents, toCents } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { Check, Pencil, Trash2, X } from "lucide-react";
import {
  ArrowDownLeft, ArrowLeftRight, ArrowUpRight,
  BookOpen, Briefcase, Car, CircleDollarSign, Coffee,
  CreditCard, Gift, HandCoins, Heart, HeartPulse,
  Home, Laptop, MoreHorizontal, Music, Scale, Shirt,
  ShoppingCart, Tv, TrendingUp, UtensilsCrossed, Wallet, Zap,
} from "lucide-react";
import type { LucideProps } from "lucide-react";

// ── Icon map para categorías ───────────────────────────────────────────────────

type LucideIcon = React.ComponentType<LucideProps>;

const ICON_MAP: Record<string, LucideIcon> = {
  "utensils":        UtensilsCrossed,
  "car":             Car,
  "home":            Home,
  "zap":             Zap,
  "heart-pulse":     HeartPulse,
  "music":           Music,
  "book-open":       BookOpen,
  "shirt":           Shirt,
  "circle-ellipsis": MoreHorizontal,
  "briefcase":       Briefcase,
  "laptop":          Laptop,
  "trending-up":     TrendingUp,
  "gift":            Gift,
  "cart":            ShoppingCart,
  "credit-card":     CreditCard,
  "heart":           Heart,
  "tv":              Tv,
  "coffee":          Coffee,
  "wallet":          Wallet,
  "home2":           Home,
};

function CategoryIcon({ name, ...props }: { name: string } & LucideProps) {
  const Icon = ICON_MAP[name] ?? CircleDollarSign;
  return <Icon {...props} />;
}

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

const EDITABLE_TYPES = new Set(["ingreso", "gasto"]);

// ── Componente ────────────────────────────────────────────────────────────────

interface TransactionDetailSheetProps {
  transaction: Doc<"transactions"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryName?: string;
  categories: Doc<"categories">[];
}

export function TransactionDetailSheet({
  transaction: tx,
  open,
  onOpenChange,
  categoryName,
  categories,
}: TransactionDetailSheetProps) {
  const updateTx = useMutation(api.transactions.update);
  const removeTx = useMutation(api.transactions.remove);
  const accounts = useQuery(api.accounts.list);
  const cards    = useQuery(api.cards.list);

  const [editing, setEditing]       = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [loading, setLoading]       = useState(false);

  // Estado del formulario de edición
  const [desc, setDesc]             = useState("");
  const [amount, setAmount]         = useState("");
  const [date, setDate]             = useState("");
  const [categoryId, setCategoryId] = useState("");

  // Reiniciar cuando cambia la transacción seleccionada o se cierra el sheet
  const [prevTx, setPrevTx] = useState(tx);
  if (tx !== prevTx) {
    setPrevTx(tx);
    if (tx) {
      setDesc(tx.description);
      setAmount(String(fromCents(tx.amount)));
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

  // Cuenta o tarjeta asociada (para mostrar en edición)
  const linkedAccount = (accounts ?? []).find((a) => a._id === currentTx.accountId);
  const linkedCard    = (cards    ?? []).find((c) => c._id === currentTx.cardId);
  const sourceLabel   = linkedAccount
    ? `${linkedAccount.name} · ${formatCents(linkedAccount.balance, linkedAccount.currency)}`
    : linkedCard
    ? `${linkedCard.name} ····${linkedCard.lastFourDigits}`
    : null;

  // Solo mostrar categorías que correspondan al tipo de la transacción
  const filteredCategories = categories.filter(
    (c) => c.type === currentTx.type || c.type === "ambos"
  );

  async function handleSave() {
    const amountNum = parseFloat(amount.replace(/[^0-9.]/g, ""));
    if (!amountNum || amountNum <= 0) {
      toast.error("El monto debe ser mayor que cero");
      return;
    }
    if (!desc.trim()) {
      toast.error("La descripción es obligatoria");
      return;
    }
    setLoading(true);
    try {
      await updateTx({
        transactionId: currentTx._id,
        amount:      toCents(amountNum),
        description: desc.trim(),
        date:        new Date(date).getTime(),
        categoryId:  categoryId
          ? (categoryId as Parameters<typeof updateTx>[0]["categoryId"])
          : undefined,
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
                style={{
                  width: 52, height: 52,
                  borderRadius: 16,
                  background: config.iconBg,
                  color: config.iconColor,
                }}
              >
                <Icon className="h-[22px] w-[22px]" aria-hidden="true" />
              </span>
              <div>
                <p
                  className="font-mono-num"
                  style={{
                    fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em",
                    color: config.amountColor, lineHeight: 1,
                  }}
                >
                  {config.sign}{formatCents(currentTx.amount, currentTx.currency)}
                </p>
                <p className="text-xs font-semibold text-muted-foreground mt-1">
                  {config.label}
                </p>
              </div>
            </div>
          )}

          {/* ── Modo edición ────────────────────────────────────────────────── */}
          {editing ? (
            <div className="space-y-4">

              {/* Monto */}
              <div>
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
              </div>

              {/* Cuenta o tarjeta (solo display) */}
              {sourceLabel && (
                <div>
                  <p className="text-[12px] font-semibold text-foreground mb-2">
                    {linkedCard ? "Tarjeta" : "Cuenta"}
                  </p>
                  <div
                    className="flex items-center px-3 h-8 rounded-lg text-sm text-muted-foreground"
                    style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
                  >
                    {sourceLabel}
                  </div>
                </div>
              )}

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

              {/* Fecha */}
              <div>
                <Label htmlFor="edit-date" className="text-[12px] font-semibold text-foreground mb-2 block">
                  Fecha
                </Label>
                <DatePicker id="edit-date" value={date} onChange={setDate} required style={{ background: "var(--surface-2)" }} />
              </div>

              {/* Categoría — Select */}
              {filteredCategories.length > 0 && (
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
            <dl
              className="rounded-xl divide-y"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                overflow: "hidden",
              }}
            >
              <DetailRow label="Descripción" value={currentTx.description} />
              <DetailRow label="Fecha" value={formatDate(currentTx.date)} />
              {categoryName && <DetailRow label="Categoría" value={categoryName} />}
              {currentTx.notes && <DetailRow label="Notas" value={currentTx.notes} />}
              {currentTx.currency && (
                <DetailRow label="Moneda" value={currentTx.currency} />
              )}
            </dl>
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <dt className="text-xs font-semibold text-muted-foreground shrink-0 pt-px">{label}</dt>
      <dd className="text-sm text-right text-foreground">{value}</dd>
    </div>
  );
}
