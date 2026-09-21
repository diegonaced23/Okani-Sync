"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import type { AccountSummary } from "@/components/accounts/AccountCard";
import { useAppData } from "@/contexts/app-data";

type Account = Doc<"accounts"> | AccountSummary;
import { Input } from "@/components/ui/input";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MoneyAmountField } from "./MoneyAmountField";
import { AccountCardSelect } from "./AccountCardSelect";
import { AppSheetFooter } from "@/components/ui/app-sheet";
import { toast } from "sonner";
import { toCents, formatCents, dateStrToTs, todayStr } from "@/lib/money";
import { ArrowDown, ArrowDownUp } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { SPRING, haptic } from "./shared";
import { buildTransferConfirmation } from "@/lib/txConfirmation";
import { SaveMovementButton, useSaveConfirmation } from "./SaveMovementButton";
import { AddChip, DateChip, ExtrasRow, Reveal } from "./FormExtras";

const FORM_ID = "tf-form";

interface TransferFormProps {
  onSuccess?: () => void;
}

export function TransferForm({ onSuccess }: TransferFormProps) {
  const { accounts } = useAppData();
  const createTransfer = useMutation(api.transactions.createTransfer);
  // listSharedWithMe es un endpoint diferente; se combina con las cuentas propias del contexto
  const sharedAccounts = useQuery(api.accounts.listSharedWithMe);

  const allAccounts: Account[] = [
    ...(accounts ?? []),
    ...(sharedAccounts ?? []).filter(
      (a): a is NonNullable<typeof a> => a !== null
    ),
  ];

  const [fromAccountId, setFromAccountId] = useState<string>("");
  const [toAccountId, setToAccountId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [exchangeRate, setExchangeRate] = useState("");
  const [description, setDescription] = useState("Transferencia");
  const [date, setDate] = useState(todayStr);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const { phase, confirm } = useSaveConfirmation(onSuccess);
  const reduce = useReducedMotion();
  // Cuántas veces se intercambiaron: cada una suma media vuelta al botón
  const [swaps, setSwaps] = useState(0);
  const [destSettled, setDestSettled] = useState(false);
  const [showDesc, setShowDesc]   = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  function swapAccounts() {
    if (!fromAccountId || !toAccountId) return;
    haptic();
    setFromAccountId(toAccountId);
    setToAccountId(fromAccountId);
    setSwaps((n) => n + 1);
    // La tasa se escribió para el sentido anterior: ya no vale
    setExchangeRate("");
  }

  const fromAccount = allAccounts.find((a) => a._id === fromAccountId);
  const toAccount = allAccounts.find((a) => a._id === toAccountId);
  const needsRate =
    fromAccount && toAccount && fromAccount.currency !== toAccount.currency;
  const amountNum = parseFloat(amount) || 0;
  // Sin `|| 1`: ese valor por defecto hacía que la guarda de abajo nunca saltara y,
  // con el campo vacío, se habría enviado una conversión 1:1 como si fuera la tasa real.
  const parsedRate = parseFloat(exchangeRate);
  const hasRate = Number.isFinite(parsedRate) && parsedRate > 0;
  const rateNum = hasRate ? parsedRate : 1;
  const toAmount = needsRate ? Math.round(amountNum * rateNum * 100) / 100 : amountNum;

  // Sin origen aún no se sabe la moneda: el botón vuelve al texto genérico
  const saveLabel = amountNum > 0 && fromAccount
    ? `Transferir ${formatCents(toCents(amountNum), fromAccount.currency)}`
    : "Registrar transferencia";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Validación de campos: errores inline (no toast) para feedback inmediato
    const errors: Record<string, string> = {};
    if (!fromAccountId || !toAccountId) {
      errors.accounts = "Selecciona las cuentas de origen y destino";
    } else if (fromAccountId === toAccountId) {
      errors.accounts = "Las cuentas deben ser distintas";
    }
    if (amountNum <= 0) errors.amount = "El monto debe ser mayor que cero";
    if (needsRate && !hasRate) errors.exchangeRate = "Ingresa la tasa de cambio";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    setLoading(true);
    try {
      await createTransfer({
        fromAccountId: fromAccountId as Id<"accounts">,
        toAccountId: toAccountId as Id<"accounts">,
        amount: toCents(amountNum),
        date: dateStrToTs(date),
        description: description.trim() || "Transferencia",
        exchangeRate: needsRate ? rateNum : undefined,
        notes: notes.trim() || undefined,
      });
      // Como en gastos e ingresos: la gota en el botón y la cápsula con el trayecto
      confirm(buildTransferConfirmation({
        amountCents: toCents(amountNum),
        currency: fromAccount!.currency,
        description,
        fromName: fromAccount!.name,
        toName: toAccount!.name,
        received: needsRate ? { amountCents: toCents(toAmount), currency: toAccount!.currency } : undefined,
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al transferir");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
      {/* Cuentas: primero solo el origen. Al elegirlo se despliega el destino y,
          entre los dos, el botón que los intercambia */}
      <div>
        <span className="mb-2 block px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Origen</span>
        {/* Sin favorita: la estrella decide el origen de gastos e ingresos, no de transferencias */}
        <AccountCardSelect
          id="tf-from"
          ariaLabel="Cuenta de origen"
          title="¿De dónde sale?"
          value={fromAccountId ? `account:${fromAccountId}` : ""}
          onValueChange={(v) => {
            const next = v.split(":")[1] ?? "";
            setFromAccountId(next);
            // El destino no puede ser la misma cuenta: se suelta en vez de dejar un
            // valor que el selector de destino ya no muestra
            if (next === toAccountId) setToAccountId("");
            if (fieldErrors.accounts) setFieldErrors((fe) => ({ ...fe, accounts: "" }));
          }}
          accounts={allAccounts}
          allowFavorite={false}
        />

        <AnimatePresence initial={false}>
          {fromAccountId && (
            <motion.div
              key="destino"
              initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0, y: -10, filter: "blur(6px)" }}
              animate={{ opacity: 1, height: "auto", y: 0, filter: "blur(0px)" }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0, y: -10, filter: "blur(6px)" }}
              transition={reduce ? { duration: 0.15 } : { ...SPRING, opacity: { duration: 0.25 }, filter: { duration: 0.3 } }}
              // Recorta solo mientras cambia de alto: en reposo cortaría la sombra del
              // botón de vidrio y el anillo de foco
              style={{ overflow: destSettled ? "visible" : "hidden" }}
              onAnimationStart={() => setDestSettled(false)}
              onAnimationComplete={() => setDestSettled(true)}
            >
              {/* Intercambio: con solo origen apunta hacia abajo; con las dos cuentas, las invierte */}
              <div className="flex justify-center py-2">
                <motion.button
                  type="button"
                  onClick={swapAccounts}
                  disabled={!toAccountId}
                  aria-label={toAccountId ? "Intercambiar origen y destino" : "El dinero va de origen a destino"}
                  initial={reduce ? false : { scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1, rotate: swaps * 180 }}
                  transition={reduce ? { duration: 0 } : { ...SPRING, delay: 0.08 }}
                  whileTap={toAccountId ? { scale: 0.88 } : undefined}
                  className="os-liquid-glass relative grid h-10 w-10 place-items-center rounded-full text-foreground disabled:cursor-default enabled:hover:text-[var(--os-cyan)]"
                >
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={toAccountId ? "swap" : "down"}
                      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
                      transition={{ duration: 0.18 }}
                      className="grid place-items-center"
                    >
                      {toAccountId
                        ? <ArrowDownUp className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden="true" />
                        : <ArrowDown className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={2.25} aria-hidden="true" />}
                    </motion.span>
                  </AnimatePresence>
                </motion.button>
              </div>

              <span className="mb-2 block px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Destino</span>
              <AccountCardSelect
                id="tf-to"
                ariaLabel="Cuenta de destino"
                title="¿A dónde llega?"
                value={toAccountId ? `account:${toAccountId}` : ""}
                onValueChange={(v) => {
                  setToAccountId(v.split(":")[1] ?? "");
                  if (fieldErrors.accounts) setFieldErrors((fe) => ({ ...fe, accounts: "" }));
                }}
                accounts={allAccounts.filter((a) => a._id !== fromAccountId)}
                allowFavorite={false}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {fieldErrors.accounts && (
          <p id="tf-accounts-error" role="alert" className="text-xs text-destructive mt-1.5">
            {fieldErrors.accounts}
          </p>
        )}
      </div>

      {/* Monto */}
      <div>
        <MoneyAmountField
          id="tf-amount"
          label={`Monto${fromAccount ? ` (${fromAccount.currency})` : ""}`}
          value={amount}
          onChange={(v) => { setAmount(v); if (fieldErrors.amount) setFieldErrors((fe) => ({ ...fe, amount: "" })); }}
          ringColor="var(--os-cyan)"
          error={fieldErrors.amount}
          fontSize={28}
        />
        {fromAccount && (
          <p className="text-xs text-muted-foreground mt-1.5">
            Saldo disponible: {formatCents(fromAccount.balance, fromAccount.currency)}
          </p>
        )}
      </div>

      {/* Tasa de cambio (solo si monedas diferentes) */}
      {needsRate && (
        <div className="rounded-lg bg-warning/10 border border-warning/20 p-3 space-y-2">
          <p className="text-xs text-warning font-medium">
            Monedas distintas: {fromAccount!.currency} → {toAccount!.currency}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="tf-rate">
              Tasa de cambio (1 {fromAccount!.currency} = ? {toAccount!.currency})
            </Label>
            <DecimalInput
              id="tf-rate"
              maxDecimals={6}
              min={0.000001}
              placeholder="Ej: 4200"
              value={exchangeRate}
              onChange={(v) => { setExchangeRate(v); if (fieldErrors.exchangeRate) setFieldErrors((fe) => ({ ...fe, exchangeRate: "" })); }}
              required
              aria-invalid={!!fieldErrors.exchangeRate}
              aria-describedby={fieldErrors.exchangeRate ? "tf-rate-error" : undefined}
            />
            {fieldErrors.exchangeRate && (
              <p id="tf-rate-error" role="alert" className="text-xs text-destructive">
                {fieldErrors.exchangeRate}
              </p>
            )}
            {amountNum > 0 && rateNum > 0 && (
              <p className="text-xs text-muted-foreground">
                Recibirás: {formatCents(toCents(toAmount), toAccount!.currency)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Lo opcional, plegado (ver FormExtras): la descripción ya dice
          «Transferencia», la fecha casi siempre es hoy y casi nunca hay nota */}
      <ExtrasRow>
        <DateChip id="tf-date" value={date} onChange={setDate} />
        {!showDesc && <AddChip label="Descripción" onClick={() => setShowDesc(true)} />}
        {!showNotes && <AddChip label="Nota" onClick={() => setShowNotes(true)} />}
      </ExtrasRow>

      <Reveal show={showDesc}>
        <div>
          <Label htmlFor="tf-desc" className="mb-2 block px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Descripción
          </Label>
          <Input
            id="tf-desc"
            // Llega con «Transferencia» escrito: se selecciona para reemplazarlo de una vez
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            placeholder="Ej: Traslado de ahorros"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ background: "var(--surface-2)" }}
          />
        </div>
      </Reveal>

      <Reveal show={showNotes}>
        <div>
          <Label htmlFor="tf-notes" className="mb-2 block px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Nota
          </Label>
          <Textarea
            id="tf-notes"
            rows={2}
            autoFocus
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            placeholder="Opcional"
            style={{ background: "var(--surface-2)" }}
          />
        </div>
      </Reveal>

      {/* Guardar, en el pie fijo de la hoja (fuera del <form>) */}
      <AppSheetFooter>
        <div data-tx-footer>
          <SaveMovementButton form={FORM_ID} className="" loading={loading} phase={phase} label={saveLabel} />
        </div>
      </AppSheetFooter>
    </form>
  );
}
