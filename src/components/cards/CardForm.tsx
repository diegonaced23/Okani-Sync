"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { AppSheetFooter } from "@/components/ui/app-sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { toCents, fromCents, formatCents } from "@/lib/money";
import { CURRENCIES, ACCOUNT_GRADIENTS } from "@/lib/constants";
import {
  CARD_BRANDS, CARD_BRAND_LABELS, autoCardName, getNextCutoffTs, getNextPaymentTs,
  eaToMonthly, monthlyToEa, type CardBrand,
} from "@/lib/cardCycle";
import { BANK_NAME_MAX, CARD_BANKS, findBank } from "@/lib/banks";
import { cn } from "@/lib/utils";
import { CardFace } from "./CardFace";
import { BrandLogo } from "./BrandLogo";

interface CardFormProps {
  card?: Doc<"cards">;
  onSuccess?: () => void;
}

type Step = 1 | 2;
type FieldErrors = Partial<Record<"name" | "bank" | "last4" | "limit" | "balance", string>>;
type RateMode = "ea" | "mv";

// Valor del select de banco que habilita escribir uno fuera del catálogo
const OTHER_BANK = "__otro__";

/**
 * Ancho de la AppSheet que contiene el formulario: en desktop da espacio para la
 * vista previa en columna propia. Lleva `data-[side=right]` para superar en
 * especificidad el `max-w-sm` base de SheetContent.
 */
export const CARD_SHEET_CLASS = "data-[side=right]:md:max-w-3xl";
const days = Array.from({ length: 31 }, (_, i) => String(i + 1));
const shortDate = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" });
const pct = (fraction: number) =>
  (fraction * 100).toLocaleString("es-CO", { maximumFractionDigits: 2 });

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <p id={id} role="alert" className="text-xs text-destructive">{message}</p>;
}

export function CardForm({ card, onSuccess }: CardFormProps) {
  const isEdit = !!card;
  // El botón de envío vive en el pie de la hoja (fuera del <form>) y lo enlaza por id
  const formId = useId();
  const createCard = useMutation(api.cards.create);
  const updateCard = useMutation(api.cards.update);

  // En creación hay dos pasos; en edición todo cabe en una sola vista
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState(card?.name ?? "");
  // Mientras el usuario no escriba el nombre, se autogenera con marca + banco + últimos 4
  const [nameTouched, setNameTouched] = useState(isEdit);
  // Banco: se elige del catálogo o, con "Otro", se escribe a mano
  const [bankChoice, setBankChoice] = useState<string | null>(() =>
    !card ? null : findBank(card.bankName) ? card.bankName : OTHER_BANK
  );
  const [customBank, setCustomBank] = useState(
    card && !findBank(card.bankName) ? card.bankName : ""
  );
  const [lastFour, setLastFour] = useState(card?.lastFourDigits ?? "");
  const [brand, setBrand] = useState<CardBrand>(card?.brand ?? "visa");
  const [creditLimit, setCreditLimit] = useState(
    isEdit ? String(fromCents(card!.creditLimit)) : ""
  );
  const [cutoffDay, setCutoffDay] = useState(String(card?.cutoffDay ?? "25"));
  const [paymentDay, setPaymentDay] = useState(String(card?.paymentDay ?? "5"));
  // La tasa se escribe como la publica el banco (E.A. por defecto) y se guarda m.v.
  const [rateMode, setRateMode] = useState<RateMode>("ea");
  const [interestRate, setInterestRate] = useState(
    card?.interestRate ? (monthlyToEa(card.interestRate) * 100).toFixed(2) : ""
  );
  // En edición, si la tasa no se toca se reenvía la guardada tal cual (sin redondeos)
  const [rateTouched, setRateTouched] = useState(false);
  const [initialBalance, setInitialBalance] = useState("");
  const [currency, setCurrency] = useState(card?.currency ?? "COP");
  const [color, setColor] = useState<string>(card?.color ?? ACCOUNT_GRADIENTS[0].key);
  // Mientras el usuario no elija color, se sugiere el del banco
  const [colorTouched, setColorTouched] = useState(isEdit);
  const [showMore, setShowMore] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const bankRef = useRef<HTMLButtonElement>(null);
  const customBankRef = useRef<HTMLInputElement>(null);
  const pickedOtherRef = useRef(false);
  const last4Ref = useRef<HTMLInputElement>(null);
  const limitRef = useRef<HTMLInputElement>(null);
  const balanceRef = useRef<HTMLInputElement>(null);
  const advancedRef = useRef(false);

  const isOtherBank = bankChoice === OTHER_BANK;
  const bankName = isOtherBank ? customBank : (bankChoice ?? "");
  const generatedName = autoCardName(brand, bankName, lastFour);
  const displayName = nameTouched ? name : generatedName;
  const limitNum = parseFloat(creditLimit) || 0;
  const balanceNum = parseFloat(initialBalance) || 0;
  const rateNum = parseFloat(interestRate);
  const rateFraction = Number.isFinite(rateNum) ? rateNum / 100 : undefined;
  const monthlyRate = rateFraction === undefined ? undefined
    : rateMode === "ea" ? eaToMonthly(rateFraction) : rateFraction;

  const nextCutoffTs = getNextCutoffTs(parseInt(cutoffDay));
  const nextPaymentTs = getNextPaymentTs(parseInt(paymentDay), nextCutoffTs);

  // Al elegir "Otro", el foco pasa al campo para escribir el banco
  useEffect(() => {
    if (isOtherBank && pickedOtherRef.current) {
      pickedOtherRef.current = false;
      customBankRef.current?.focus();
    }
  }, [isOtherBank]);

  // Al pasar al paso 2, el foco va al primer campo (y no al cargar el formulario)
  useEffect(() => {
    if (step === 2 && advancedRef.current) limitRef.current?.focus();
  }, [step]);

  function clearError(field: keyof FieldErrors) {
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  }

  // Devuelve true si hay errores; enfoca el primer campo inválido
  function reportErrors(found: FieldErrors, order: (keyof FieldErrors)[]) {
    setErrors(found);
    const refs = {
      name: nameRef, bank: isOtherBank ? customBankRef : bankRef,
      last4: last4Ref, limit: limitRef, balance: balanceRef,
    };
    const first = order.find((f) => found[f]);
    if (first) refs[first].current?.focus();
    return !!first;
  }

  function validateIdentity(): FieldErrors {
    const found: FieldErrors = {};
    if (!bankChoice) found.bank = "Elige el banco emisor";
    else if (isOtherBank && !customBank.trim()) found.bank = "Escribe el nombre del banco";
    if (lastFour.length !== 4) found.last4 = "Deben ser 4 números";
    return found;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Paso 1 → validar identidad y avanzar (Enter también avanza, no envía)
    if (!isEdit && step === 1) {
      if (reportErrors(validateIdentity(), ["bank", "last4"])) return;
      advancedRef.current = true;
      setStep(2);
      return;
    }

    const found: FieldErrors = {};
    if (isEdit && !name.trim()) found.name = "Escribe un nombre para la tarjeta";
    if (limitNum <= 0) found.limit = "El cupo debe ser mayor que cero";
    if (!isEdit && balanceNum > limitNum && limitNum > 0) found.balance = "No puede ser mayor que el cupo";
    if (reportErrors(found, ["name", "limit", "balance"])) return;

    const interestToSave = isEdit && !rateTouched ? card!.interestRate : monthlyRate;

    const finalName = (nameTouched ? name.trim() : "") || generatedName;

    setLoading(true);
    try {
      if (isEdit) {
        await updateCard({
          cardId: card!._id as Id<"cards">,
          name: finalName,
          creditLimit: toCents(limitNum),
          cutoffDay: parseInt(cutoffDay),
          paymentDay: parseInt(paymentDay),
          interestRate: interestToSave,
          color,
        });
        toast.success("Tarjeta actualizada");
      } else {
        await createCard({
          name: finalName,
          bankName: bankName.trim(),
          lastFourDigits: lastFour,
          brand,
          creditLimit: toCents(limitNum),
          initialBalance: balanceNum > 0 ? toCents(balanceNum) : undefined,
          cutoffDay: parseInt(cutoffDay),
          paymentDay: parseInt(paymentDay),
          interestRate: interestToSave,
          currency,
          color,
          icon: "credit-card",
        });
        toast.success("Tarjeta creada correctamente");
      }
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  const showIdentity = isEdit || step === 1;
  const showTerms = isEdit || step === 2;

  // ─── Bloques de campos ──────────────────────────────────────────────────────

  const nameField = (
    <div className="space-y-1.5">
      <Label htmlFor="card-name">
        Nombre de la tarjeta{isEdit && <span aria-hidden="true" className="text-danger"> *</span>}
      </Label>
      <Input
        id="card-name"
        ref={nameRef}
        value={displayName}
        placeholder={generatedName}
        maxLength={100}
        onChange={(e) => { setName(e.target.value); setNameTouched(true); clearError("name"); }}
        aria-invalid={!!errors.name}
        aria-describedby={errors.name ? "card-name-error" : !isEdit ? "card-name-hint" : undefined}
      />
      <FieldError id="card-name-error" message={errors.name} />
      {!isEdit && !errors.name && (
        <p id="card-name-hint" className="text-xs text-muted-foreground">
          Se genera solo con la marca, el banco y los dígitos. Puedes cambiarlo.
        </p>
      )}
    </div>
  );

  const colorField = (
    <div className="space-y-1.5">
      <Label id="card-color-label">Color de tarjeta</Label>
      <div role="group" aria-labelledby="card-color-label" className="flex flex-wrap gap-2">
        {ACCOUNT_GRADIENTS.map((g) => (
          <button key={g.key} type="button" onClick={() => { setColor(g.key); setColorTouched(true); }}
            title={g.label} aria-label={g.label} aria-pressed={color === g.key}
            className={cn("touch-hit h-8 w-8 rounded-full border-2 transition-all",
              color === g.key ? "border-foreground scale-110 shadow-md" : "border-transparent")}
            style={{ background: g.gradient }} />
        ))}
      </div>
    </div>
  );

  function chooseBank(value: string | null) {
    if (!value) return;
    setBankChoice(value);
    clearError("bank");
    if (value === OTHER_BANK) {
      pickedOtherRef.current = true;
      return;
    }
    const known = findBank(value);
    if (known && !colorTouched) setColor(known.color);
  }

  // Cambiar de E.A. a m.v. (o al revés) convierte el valor: la tasa sigue siendo la misma
  function changeRateMode(next: RateMode) {
    if (next === rateMode) return;
    if (rateFraction !== undefined) {
      const converted = next === "mv" ? eaToMonthly(rateFraction) : monthlyToEa(rateFraction);
      setInterestRate((converted * 100).toFixed(2));
      setRateTouched(true);
    }
    setRateMode(next);
  }

  const rateModes: { value: RateMode; label: string }[] = [
    { value: "ea", label: "E.A." },
    { value: "mv", label: "m.v." },
  ];

  const rateField = (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="card-rate">Tasa de interés % (opcional)</Label>
        {/* E.A. es como la publica el banco; m.v. es como se guarda */}
        <div role="radiogroup" aria-label="Tipo de tasa" className="flex rounded-lg bg-muted p-0.5">
          {rateModes.map((m) => (
            <button key={m.value} type="button" role="radio" aria-checked={rateMode === m.value}
              onClick={() => changeRateMode(m.value)}
              className={cn("touch-hit rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                rateMode === m.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <DecimalInput id="card-rate" maxDecimals={2} min={0} max={rateMode === "ea" ? 300 : 100}
        placeholder={rateMode === "ea" ? "Ej: 28 (= 28% E.A.)" : "Ej: 2,08 (= 2,08% m.v.)"}
        value={interestRate} onChange={(v) => { setInterestRate(v); setRateTouched(true); }}
        aria-describedby="card-rate-hint" />
      <p id="card-rate-hint" className="text-xs text-muted-foreground" aria-live="polite">
        {rateFraction !== undefined && rateFraction > 0
          ? rateMode === "ea"
            ? <>Equivale a <strong className="text-foreground">{pct(eaToMonthly(rateFraction))}% m.v.</strong> Se usa por defecto en compras a cuotas.</>
            : <>Equivale a <strong className="text-foreground">{pct(monthlyToEa(rateFraction))}% E.A.</strong> Se usa por defecto en compras a cuotas.</>
          : "Escríbela como aparece en tu extracto. Se usa por defecto en compras a cuotas."}
      </p>
    </div>
  );

  return (
    // @container: en hojas anchas (desktop) la vista previa pasa a una columna fija
    <form id={formId} onSubmit={handleSubmit} noValidate className="@container">
      <div className="space-y-5 @2xl:grid @2xl:grid-cols-[minmax(0,18rem)_1fr] @2xl:items-start @2xl:gap-8 @2xl:space-y-0">
        <div className="space-y-5 @2xl:sticky @2xl:top-0">
          {/* Vista previa en vivo */}
          <div
            className="overflow-hidden shadow-lg"
            style={{ borderRadius: 22 }}
            aria-label={`Vista previa: ${displayName || generatedName}`}
            role="img"
          >
            <CardFace
              brand={brand}
              lastFourDigits={lastFour}
              name={displayName || generatedName}
              color={color}
              trailing={limitNum > 0 && showTerms ? (
                <span className="font-mono-num flex-shrink-0" style={{ fontWeight: 700 }}>
                  {balanceNum > 0 && balanceNum <= limitNum
                    ? `Disponible ${formatCents(toCents(limitNum - balanceNum), currency)}`
                    : `Cupo ${formatCents(toCents(limitNum), currency)}`}
                </span>
              ) : undefined}
            />
          </div>

          {/* Indicador de pasos — solo en creación */}
          {!isEdit && (
            <div className="space-y-2">
              <div className="flex gap-1.5" aria-hidden="true">
                {[1, 2].map((s) => (
                  <span key={s} className={cn("h-1 flex-1 rounded-full transition-colors",
                    s <= step ? "bg-primary" : "bg-muted")} />
                ))}
              </div>
              <p className="text-xs font-semibold text-muted-foreground" aria-live="polite">
                Paso {step} de 2 · {step === 1 ? "Tu tarjeta" : "Cupo y fechas"}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-5">
          {/* ─── Paso 1: identidad ─── */}
          {showIdentity && (
            <div className="space-y-4">
              {isEdit ? (
                <>
                  {nameField}
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">Banco · Marca · Últimos 4</Label>
                    <p className="text-sm px-3 py-2 rounded-md bg-muted text-foreground">
                      {card!.bankName} · {CARD_BRAND_LABELS[card!.brand ?? "otro"]} ···{card!.lastFourDigits}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-[1fr_7.5rem] gap-3">
                    <div className="min-w-0 space-y-1.5">
                      <Label htmlFor="card-bank">Banco <span aria-hidden="true" className="text-danger">*</span></Label>
                      <Select value={bankChoice} onValueChange={(v) => chooseBank(v as string | null)}>
                        <SelectTrigger id="card-bank" ref={bankRef} className="w-full"
                          aria-invalid={!!errors.bank && !isOtherBank}
                          aria-describedby={errors.bank && !isOtherBank ? "card-bank-error" : undefined}>
                          <SelectValue placeholder="Elige tu banco" className="truncate">
                            {(v: string | null) => v === OTHER_BANK ? "Otro" : v}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {CARD_BANKS.map((b) => <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>)}
                          <SelectItem value={OTHER_BANK}>Otro</SelectItem>
                        </SelectContent>
                      </Select>
                      {!isOtherBank && <FieldError id="card-bank-error" message={errors.bank} />}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="card-last4">Últimos 4 <span aria-hidden="true" className="text-danger">*</span></Label>
                      <Input id="card-last4" ref={last4Ref} placeholder="1234" maxLength={4} value={lastFour}
                        inputMode="numeric" pattern="\d{4}" autoComplete="off"
                        className="font-mono-num tracking-[0.2em]"
                        onChange={(e) => { setLastFour(e.target.value.replace(/\D/g, "")); clearError("last4"); }}
                        required aria-invalid={!!errors.last4}
                        aria-describedby={errors.last4 ? "card-last4-error" : undefined} />
                      <FieldError id="card-last4-error" message={errors.last4} />
                    </div>
                  </div>

                  {/* "Otro": el banco se escribe a mano */}
                  {isOtherBank && (
                    <div className="-mt-1 space-y-1.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <Label htmlFor="card-bank-custom">Nombre del banco <span aria-hidden="true" className="text-danger">*</span></Label>
                        <span className="text-xs text-muted-foreground tabular-nums" aria-hidden="true">
                          {customBank.length}/{BANK_NAME_MAX}
                        </span>
                      </div>
                      <Input id="card-bank-custom" ref={customBankRef} value={customBank}
                        placeholder="Escribe el nombre del banco" autoComplete="off" maxLength={BANK_NAME_MAX}
                        onChange={(e) => { setCustomBank(e.target.value); clearError("bank"); }}
                        required aria-invalid={!!errors.bank}
                        aria-describedby={errors.bank ? "card-bank-error" : undefined} />
                      <FieldError id="card-bank-error" message={errors.bank} />
                    </div>
                  )}

                  <fieldset className="space-y-1.5">
                    <legend className="text-sm font-medium leading-none mb-1.5">Marca</legend>
                    <div className="grid grid-cols-5 gap-2">
                      {CARD_BRANDS.map((b) => (
                        <label
                          key={b.value}
                          title={b.label}
                          className={cn(
                            "flex h-12 cursor-pointer items-center justify-center rounded-xl border bg-transparent",
                            "text-foreground transition-colors hover:bg-muted",
                            "has-checked:border-primary has-checked:bg-primary/10 has-checked:ring-1 has-checked:ring-primary",
                            "has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
                          )}
                        >
                          <input type="radio" name="card-brand" value={b.value}
                            checked={brand === b.value} onChange={() => setBrand(b.value)}
                            className="sr-only" />
                          {b.value === "otro" ? (
                            <span className="text-xs font-semibold">{b.label}</span>
                          ) : (
                            <BrandLogo brand={b.value} size={26} />
                          )}
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  {colorField}
                  {nameField}
                </>
              )}
            </div>
          )}

          {/* ─── Paso 2: cupo y fechas ─── */}
          {showTerms && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="card-limit">Cupo total <span aria-hidden="true" className="text-danger">*</span></Label>
                <MoneyInput id="card-limit" ref={limitRef} placeholder="5.000.000"
                  value={creditLimit}
                  onChange={(v) => { setCreditLimit(v); clearError("limit"); }}
                  required aria-invalid={!!errors.limit}
                  aria-describedby={errors.limit ? "card-limit-error" : undefined} />
                <FieldError id="card-limit-error" message={errors.limit} />
              </div>

              {!isEdit && (
                <div className="space-y-1.5">
                  <Label htmlFor="card-balance">Deuda actual (opcional)</Label>
                  <MoneyInput id="card-balance" ref={balanceRef} placeholder="0"
                    value={initialBalance}
                    onChange={(v) => { setInitialBalance(v); clearError("balance"); }}
                    aria-invalid={!!errors.balance}
                    aria-describedby={errors.balance ? "card-balance-error" : "card-balance-hint"} />
                  <FieldError id="card-balance-error" message={errors.balance} />
                  {!errors.balance && (
                    <p id="card-balance-hint" className="text-xs text-muted-foreground">
                      Si la tarjeta ya tiene saldo usado, escríbelo para que el disponible sea correcto.
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="card-cutoff">Día de corte</Label>
                    <Select value={cutoffDay} onValueChange={(v) => { if (v) setCutoffDay(v); }}>
                      <SelectTrigger id="card-cutoff" className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>{days.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="card-payment">Día de pago</Label>
                    <Select value={paymentDay} onValueChange={(v) => { if (v) setPaymentDay(v); }}>
                      <SelectTrigger id="card-payment" className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>{days.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                {/* Fechas reales: confirman que corte y pago quedaron bien entendidos */}
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  Próximo corte: <strong className="text-foreground">{shortDate.format(nextCutoffTs)}</strong>
                  {" · "}Pagas el <strong className="text-foreground">{shortDate.format(nextPaymentTs)}</strong>
                </p>
                {cutoffDay === paymentDay && (
                  <p role="status" className="text-xs text-warning-text">
                    El corte y el pago casi nunca caen el mismo día. Revisa que sean correctos.
                  </p>
                )}
              </div>

              {isEdit ? (
                <>
                  {rateField}
                  {colorField}
                </>
              ) : (
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={() => setShowMore((v) => !v)}
                    aria-expanded={showMore}
                    aria-controls="card-more-options"
                    className="flex w-full items-center justify-between rounded-lg py-1 text-sm font-medium"
                  >
                    <span>
                      Más opciones{" "}
                      <span className="font-normal text-muted-foreground">
                        · {currency}{interestRate ? ` · ${interestRate.replace(".", ",")}% ${rateMode === "ea" ? "E.A." : "m.v."}` : ""}
                      </span>
                    </span>
                    <ChevronDown aria-hidden="true"
                      className={cn("h-4 w-4 transition-transform", showMore && "rotate-180")} />
                  </button>
                  {showMore && (
                    <div id="card-more-options" className="space-y-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="card-currency">Moneda</Label>
                        <Select value={currency} onValueChange={(v) => { if (v) setCurrency(v); }}>
                          <SelectTrigger id="card-currency" className="w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CURRENCIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      {rateField}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Acciones: van al pie fijo de la hoja si la hoja lo reserva */}
      <AppSheetFooter>
        <div className="flex gap-2">
          {!isEdit && step === 2 && (
            <Button type="button" variant="outline" className="flex-1"
              onClick={() => setStep(1)} disabled={loading}>
              Atrás
            </Button>
          )}
          <Button type="submit" form={formId} className="flex-1" disabled={loading}>
            {loading ? "Guardando…"
              : isEdit ? "Guardar cambios"
              : step === 1 ? "Siguiente" : "Crear tarjeta"}
          </Button>
        </div>
      </AppSheetFooter>
    </form>
  );
}
