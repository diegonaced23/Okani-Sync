"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { haptic } from "@/lib/ios";
import { FACTORY_RESET_PHRASE } from "@/lib/constants";
import { SettingsCard } from "./SettingsCard";
import { errorMessage } from "@/lib/errorMessage";

/**
 * Nombre legible de cada tabla, en plural. Solo se listan las que el usuario
 * reconoce como suyas: ver "netWorthSnapshots: 12" no le dice nada a nadie.
 */
const LABELS: Record<string, string> = {
  transactions: "movimientos",
  accounts: "cuentas",
  cards: "tarjetas de crédito",
  cardPurchases: "compras a crédito",
  cardInstallments: "cuotas",
  budgets: "presupuestos",
  recurringTransactions: "movimientos recurrentes",
  debts: "deudas",
  debtPayments: "abonos a deudas",
  loans: "préstamos",
  loanRepayments: "abonos recibidos",
  goals: "metas de ahorro",
  categories: "categorías",
  accountShares: "cuentas compartidas",
  netWorthSnapshots: "registros de patrimonio",
};

/** Orden de presentación: primero lo que más pesa en la cabeza del usuario. */
const ORDER = [
  "transactions", "accounts", "cards", "cardPurchases", "cardInstallments",
  "budgets", "recurringTransactions", "debts", "debtPayments",
  "loans", "loanRepayments", "goals", "categories", "accountShares",
  "netWorthSnapshots",
];

export function FactoryResetCard({ index }: { index?: number }) {
  const preview = useQuery(api.factoryReset.getResetPreview);
  const reset = useAction(api.factoryReset.run);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [phrase, setPhrase] = useState("");
  const [loading, setLoading] = useState(false);

  // Comparación exacta, sin normalizar mayúsculas: si se aceptara cualquier
  // variante, teclear la frase dejaría de ser un acto deliberado.
  const confirmed = phrase === FACTORY_RESET_PHRASE;

  const rows = preview
    ? ORDER.filter((t) => (preview.counts[t] ?? 0) > 0)
        .map((t) => ({ table: t, label: LABELS[t], count: preview.counts[t] }))
    : [];
  const isEmpty = preview !== undefined && preview.total === 0;

  function close() {
    setOpen(false);
    // El estado se limpia al cerrar para que la próxima vez vuelva a empezar
    // por el resumen: reabrir en el paso 2 con la frase ya escrita anularía
    // toda la verificación.
    setStep(1);
    setPhrase("");
  }

  async function handleReset() {
    if (!confirmed) return;
    haptic();
    setLoading(true);
    try {
      const { total } = await reset({ confirmation: FACTORY_RESET_PHRASE });
      toast.success(
        total > 0
          ? `Cuenta restablecida — se borraron ${total.toLocaleString("es-CO")} registros`
          : "Cuenta restablecida",
      );
      close();
    } catch (err) {
      toast.error(
        errorMessage(err, "No se pudo restablecer la cuenta"),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <SettingsCard
        icon={RotateCcw}
        tone="var(--danger)"
        title="Restablecer datos de fábrica"
        index={index}
        description="Borra todo lo que has registrado —cuentas, movimientos, tarjetas, presupuestos, deudas, préstamos y metas— y deja la app como recién instalada. Tu nombre, tu correo y tu sesión no se tocan."
        footnote="No se puede deshacer. Descarga antes un respaldo si quieres conservar algo."
      >
        <button
          type="button"
          onClick={() => { haptic(); setOpen(true); }}
          disabled={isEmpty}
          className="touch-hit flex h-11 w-full items-center justify-center gap-2 rounded-[16px] border border-danger/30 bg-danger/10 text-[14px] font-bold text-danger-text transition-transform active:scale-[0.98] disabled:opacity-50"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          {isEmpty ? "No hay nada que borrar" : "Restablecer mi cuenta"}
        </button>
      </SettingsCard>

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-danger">
              {step === 1 ? "Esto es lo que se va a borrar" : "Confirmación final"}
            </DialogTitle>
            <DialogDescription>
              {step === 1
                ? "Revisa las cifras antes de continuar. Son tus datos reales."
                : "Último paso. Después de esto no hay vuelta atrás."}
            </DialogDescription>
          </DialogHeader>

          {step === 1 ? (
            <div className="space-y-4 pt-1">
              {preview === undefined ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Contando tus datos…
                </p>
              ) : (
                <>
                  <ul className="divide-y divide-border rounded-[14px] border border-border">
                    {rows.map(({ table, label, count }) => (
                      <li key={table} className="flex items-baseline justify-between px-3 py-2 text-sm">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-semibold tabular-nums">
                          {count.toLocaleString("es-CO")}
                          {preview.capped && count >= 1000 ? "+" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="flex gap-3 rounded-[14px] border border-danger/20 bg-danger/10 p-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
                    <div className="space-y-1 text-sm">
                      <p className="font-semibold text-foreground">Se conserva</p>
                      <p className="text-muted-foreground">
                        Tu nombre, tu foto, tu correo y tu sesión. Volverás a tener la
                        cuenta «Billetera» y las categorías por defecto, como al
                        empezar. La moneda y el tema vuelven a sus valores iniciales.
                      </p>
                      {(preview.counts.accountShares ?? 0) > 0 && (
                        <p className="pt-1 text-muted-foreground">
                          Ojo: quien tenga acceso a tus cuentas compartidas lo perderá,
                          y tú perderás el acceso a las que te comparten.
                        </p>
                      )}
                      {preview.foreignTransactions > 0 && (
                        <p className="pt-1 font-medium text-danger-text">
                          Se borrarán además{" "}
                          {preview.foreignTransactions.toLocaleString("es-CO")} movimientos
                          que otras personas registraron en tus cuentas. Son datos suyos,
                          y también desaparecen.
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={close}>
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={preview === undefined}
                  onClick={() => setStep(2)}
                >
                  Continuar
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <Label htmlFor="factory-reset-phrase">
                  Escribe <span className="font-mono font-bold">{FACTORY_RESET_PHRASE}</span> para confirmar
                </Label>
                <Input
                  id="factory-reset-phrase"
                  value={phrase}
                  onChange={(e) => setPhrase(e.target.value)}
                  placeholder={FACTORY_RESET_PHRASE}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={loading}
                  onClick={() => { setStep(1); setPhrase(""); }}
                >
                  Atrás
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={!confirmed || loading}
                  onClick={handleReset}
                >
                  {loading
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />Borrando…</>
                    : "Borrar todo"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
