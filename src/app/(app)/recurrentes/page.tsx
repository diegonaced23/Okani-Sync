"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useState } from "react";
import { Plus, Pencil, Trash2, Repeat, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppSheet } from "@/components/ui/app-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { RecurrenteForm } from "@/components/recurrentes/RecurrenteForm";
import { CategoryIcon } from "@/lib/category-icons";
import { formatCents } from "@/lib/money";
import { toast } from "sonner";
import type { Doc } from "../../../../convex/_generated/dataModel";

function daysUntil(ts: number): string {
  const diff = Math.ceil((ts - Date.now()) / 86_400_000);
  if (diff <= 0) return "hoy o mañana";
  if (diff === 1) return "mañana";
  return `en ${diff} días`;
}

export default function RecurrentesPage() {
  const recurrentes = useQuery(api.recurringTransactions.list);
  const accounts   = useQuery(api.accounts.list);
  const cards      = useQuery(api.cards.list);
  const categories = useQuery(api.categories.list, {});
  const removeRec  = useMutation(api.recurringTransactions.remove);

  const [newOpen, setNewOpen]     = useState(false);
  const [editing, setEditing]     = useState<Doc<"recurringTransactions"> | null>(null);
  const [deleting, setDeleting]   = useState<Doc<"recurringTransactions"> | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const isLoading = recurrentes === undefined;

  const sorted = [...(recurrentes ?? [])].sort((a, b) => a.nextOccurrence - b.nextOccurrence);

  const totalMonthly = (recurrentes ?? []).reduce((s, r) => s + r.amount, 0);

  function resolveSource(r: Doc<"recurringTransactions">): string {
    if (r.accountId) {
      const acc = (accounts ?? []).find((a) => a._id === r.accountId);
      return acc ? acc.name : "Sin fuente";
    }
    if (r.cardId) {
      const card = (cards ?? []).find((c) => c._id === r.cardId);
      return card ? `${card.name} ····${card.lastFourDigits}` : "Sin fuente";
    }
    return "Sin fuente";
  }

  function resolveCategory(r: Doc<"recurringTransactions">) {
    if (!r.categoryId) return null;
    return (categories ?? []).find((c) => c._id === r.categoryId) ?? null;
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await removeRec({ recurringId: deleting._id });
      toast.success("Recurrente eliminado");
      setDeleting(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Recurrentes</h1>
          {!isLoading && totalMonthly > 0 && (
            <p className="text-sm text-muted-foreground mt-0.5">
              Total mensual estimado: {formatCents(totalMonthly, "COP")}
            </p>
          )}
        </div>
        {/* Botón desktop */}
        <Button
          size="sm"
          onClick={() => setNewOpen(true)}
          className="hidden md:flex gap-1.5 bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-500 hover:to-teal-600 text-white border-0 shadow-md shrink-0"
        >
          <Plus className="h-4 w-4" /> Nuevo
        </Button>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ background: "var(--surface-2)" }}
          >
            <Repeat className="h-6 w-6 text-muted-foreground" />
          </span>
          <p className="text-base font-semibold text-foreground">Sin movimientos recurrentes</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            Define tus gastos mensuales y se registrarán automáticamente cada mes.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((rec) => {
            const sourceName = resolveSource(rec);
            const category   = resolveCategory(rec);
            const sourceCurrency = (() => {
              if (rec.accountId) return (accounts ?? []).find((a) => a._id === rec.accountId)?.currency ?? rec.currency;
              if (rec.cardId)    return (cards ?? []).find((c) => c._id === rec.cardId)?.currency ?? rec.currency;
              return rec.currency;
            })();

            return (
              <div
                key={rec._id}
                className="rounded-xl bg-card border border-border p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Info principal */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground truncate">
                        {rec.description}
                      </span>
                      <span
                        className="text-sm font-bold tabular-nums shrink-0"
                        style={{ color: "var(--os-magenta)" }}
                      >
                        {formatCents(rec.amount, sourceCurrency)}
                      </span>
                    </div>

                    {/* Fuente */}
                    <p className="text-xs text-muted-foreground truncate">{sourceName}</p>

                    {/* Categoría */}
                    {category && (
                      <span
                        className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          background: category.color + "22",
                          color: category.color,
                        }}
                      >
                        <CategoryIcon name={category.icon} className="h-3 w-3 shrink-0" />
                        {category.name}
                      </span>
                    )}

                    {/* Próxima ejecución */}
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <CalendarClock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-[11px] text-muted-foreground">
                        Día {rec.dayOfMonth} de cada mes · {daysUntil(rec.nextOccurrence)}
                      </span>
                    </div>
                  </div>

                  {/* Acciones */}
                  <div className="flex items-center gap-0.5 shrink-0 -mr-1">
                    <button
                      type="button"
                      onClick={() => setEditing(rec)}
                      className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      aria-label="Editar recurrente"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(rec)}
                      className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-danger"
                      aria-label="Eliminar recurrente"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Botón mobile */}
      {!isLoading && (
        <div className="md:hidden">
          <Button
            onClick={() => setNewOpen(true)}
            className="w-full gap-2 bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-500 hover:to-teal-600 text-white border-0 shadow-lg rounded-xl h-12 text-base font-semibold"
          >
            <Plus className="h-5 w-5" /> Agregar recurrente
          </Button>
        </div>
      )}

      {/* Sheet creación */}
      <AppSheet
        open={newOpen}
        onOpenChange={(open) => { if (!open) setNewOpen(false); }}
        title="Nuevo recurrente"
        description="El gasto se registrará automáticamente cada mes."
      >
        <RecurrenteForm onSuccess={() => setNewOpen(false)} />
      </AppSheet>

      {/* Sheet edición */}
      <AppSheet
        open={!!editing}
        onOpenChange={(open) => { if (!open) setEditing(null); }}
        title="Editar recurrente"
        description="Los cambios aplican a partir del próximo mes."
      >
        {editing && (
          <RecurrenteForm recurrente={editing} onSuccess={() => setEditing(null)} />
        )}
      </AppSheet>

      {/* AlertDialog eliminar */}
      <AlertDialog open={!!deleting} onOpenChange={(open) => { if (!open) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar recurrente</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && (
                <>
                  <strong>"{deleting.description}"</strong> dejará de generar gastos automáticos.
                  Las transacciones ya registradas se mantendrán intactas.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleteLoading}>
              {deleteLoading ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
