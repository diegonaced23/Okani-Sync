"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { AppSheet, AppSheetFooter } from "@/components/ui/app-sheet";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Input } from "@/components/ui/input";
import { SourceChip } from "@/components/ui/source-chip";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ACCOUNT_GRADIENTS, CURRENCIES } from "@/lib/constants";
import { BANK_NAME_MAX, CARD_BANKS, findBank } from "@/lib/banks";
import {
  CARD_BRANDS, CARD_BRAND_LABELS, autoCardName, eaToMonthly, getNextCutoffTs,
  getNextPaymentTs, monthlyToEa, type CardBrand,
} from "@/lib/cardCycle";
import { FIELD_LABEL, OVERFLOW_ROW } from "@/lib/ios";
import { formatCents, fromCents, toCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { BrandLogo } from "./BrandLogo";
import { CardFace } from "./CardFace";
import { EASE_OUT_EXPO, SPRING, haptic } from "./shared";
import { errorMessage } from "@/lib/errorMessage";

type Step = 1 | 2;
type FieldErrors = Partial<Record<"name" | "bank" | "last4" | "limit" | "balance", string>>;
type RateMode = "ea" | "mv";

/** Valor del select de banco que habilita escribir uno fuera del catálogo */
const OTHER_BANK = "__otro__";

/**
 * Ancho de la hoja: en desktop da espacio para que la vista previa ocupe su propia
 * columna. Lleva `data-[side=right]` para superar en especificidad el `max-w-sm`
 * base de SheetContent.
 */
const SHEET_CLASS = "data-[side=right]:md:max-w-3xl";

const days = Array.from({ length: 31 }, (_, i) => String(i + 1));
const shortDate = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" });
const pct = (fraction: number) =>
  (fraction * 100).toLocaleString("es-CO", { maximumFractionDigits: 2 });

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <p id={id} role="alert" className="px-1 text-xs text-destructive">{message}</p>;
}

export function CardSheet({
  open,
  onOpenChange,
  card,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = crear */
  card: Doc<"cards"> | null;
}) {
  // Cada apertura reinicia el formulario, sin arrastrar lo escrito la vez anterior
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession((s) => s + 1);
  }

  return (
    <AppSheet
      open={open}
      onOpenChange={onOpenChange}
      title={card ? "Editar tarjeta" : "Nueva tarjeta de crédito"}
      footer
      contentClassName={SHEET_CLASS}
    >
      <CardFields
        key={`${card?._id ?? "new"}-${session}`}
        card={card}
        onDone={() => onOpenChange(false)}
      />
    </AppSheet>
  );
}

function CardFields({ card, onDone }: { card: Doc<"cards"> | null; onDone: () => void }) {
  const isEdit = !!card;
  const reduce = useReducedMotion();
  // El botón de envío vive en el pie de la hoja (fuera del <form>) y lo enlaza por id
  const formId = useId();
  const me = useQuery(api.users.getMe);
  const createCard = useMutation(api.cards.create);
  const updateCard = useMutation(api.cards.update);
  const accounts = useQuery(api.accounts.list);

  // En creación hay dos pasos; en edición todo cabe en una sola vista
  const [step, setStep] = useState<Step>(1);
  // Dirección del último salto: sin ella el panel que sale usa el `step` de su
  // cierre y ambos paneles se irían hacia el mismo lado.
  const [dir, setDir] = useState(1);
  const [name, setName] = useState(card?.name ?? "");
  // Mientras no se escriba el nombre, se autogenera con marca + banco + últimos 4
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
  const [creditLimit, setCreditLimit] = useState(isEdit ? String(fromCents(card.creditLimit)) : "");
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
  // null = nadie la eligió: se resuelve con la preferencia del usuario, que en el
  // primer render todavía es undefined.
  const [currencyChoice, setCurrencyChoice] = useState<string | null>(null);
  const currency = currencyChoice ?? card?.currency ?? me?.currency ?? "COP";
  const [color, setColor] = useState<string>(card?.color ?? ACCOUNT_GRADIENTS[0].key);
  // Mientras no se elija color, se sugiere el del banco
  const [colorTouched, setColorTouched] = useState(isEdit);
  const [showMore, setShowMore] = useState(false);
  // Cuenta de cobro: sale preseleccionada al pagar. Solo cuentas en la moneda de la
  // tarjeta, porque el pago no convierte; si cambia la moneda, la elegida deja de valer.
  const [billingChoice, setBillingChoice] = useState<Id<"accounts"> | null>(card?.billingAccountId ?? null);
  const billingOptions = (accounts ?? []).filter((a) => a.currency === currency);
  const billingAccountId = billingOptions.some((a) => a._id === billingChoice) ? billingChoice : null;
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<"idle" | "saving" | "done">("idle");

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

  /** Devuelve true si hay errores; enfoca el primer campo inválido. */
  function reportErrors(found: FieldErrors, order: (keyof FieldErrors)[]) {
    setErrors(found);
    const refs = {
      name: nameRef,
      bank: isOtherBank ? customBankRef : bankRef,
      last4: last4Ref,
      limit: limitRef,
      balance: balanceRef,
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

  function chooseBank(value: string | null) {
    if (!value) return;
    haptic();
    setBankChoice(value);
    clearError("bank");
    if (value === OTHER_BANK) {
      pickedOtherRef.current = true;
      return;
    }
    const known = findBank(value);
    if (known && !colorTouched) setColor(known.color);
  }

  /** Cambiar de E.A. a m.v. convierte el valor: la tasa sigue siendo la misma. */
  function changeRateMode(next: RateMode) {
    if (next === rateMode) return;
    haptic();
    if (rateFraction !== undefined) {
      const converted = next === "mv" ? eaToMonthly(rateFraction) : monthlyToEa(rateFraction);
      setInterestRate((converted * 100).toFixed(2));
      setRateTouched(true);
    }
    setRateMode(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Paso 1 → validar identidad y avanzar (Enter también avanza, no envía)
    if (!isEdit && step === 1) {
      if (reportErrors(validateIdentity(), ["bank", "last4"])) return;
      advancedRef.current = true;
      haptic();
      setDir(1);
      setStep(2);
      return;
    }

    const found: FieldErrors = {};
    if (isEdit && !name.trim()) found.name = "Escribe un nombre para la tarjeta";
    if (limitNum <= 0) found.limit = "El cupo debe ser mayor que cero";
    if (!isEdit && balanceNum > limitNum && limitNum > 0) found.balance = "No puede ser mayor que el cupo";
    if (reportErrors(found, ["name", "limit", "balance"])) return;

    const interestToSave = isEdit && !rateTouched ? card.interestRate : monthlyRate;
    const finalName = (nameTouched ? name.trim() : "") || generatedName;

    setStatus("saving");
    try {
      if (isEdit) {
        await updateCard({
          cardId: card._id,
          name: finalName,
          creditLimit: toCents(limitNum),
          cutoffDay: parseInt(cutoffDay),
          paymentDay: parseInt(paymentDay),
          interestRate: interestToSave,
          color,
          // Sin las cuentas cargadas no se sabe si la de cobro sigue disponible: no se toca
          ...(billingAccountId
            ? { billingAccountId }
            : card.billingAccountId && accounts !== undefined ? { clearBillingAccount: true } : {}),
        });
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
          billingAccountId: billingAccountId ?? undefined,
        });
      }
      haptic(15);
      setStatus("done");
      toast.success(isEdit ? "Tarjeta actualizada" : "Tarjeta creada");
      setTimeout(onDone, reduce ? 0 : 480);
    } catch (err) {
      setStatus("idle");
      toast.error(errorMessage(err, "No se pudo guardar"));
    }
  }

  const showIdentity = isEdit || step === 1;
  const showTerms = isEdit || step === 2;
  const busy = status !== "idle";

  // ─── Bloques reutilizados entre pasos ───────────────────────────────────────

  const nameField = (
    <div className="space-y-2">
      <label htmlFor={`${formId}-name`} className={FIELD_LABEL}>Nombre de la tarjeta</label>
      <Input
        id={`${formId}-name`}
        ref={nameRef}
        value={displayName}
        placeholder={generatedName}
        maxLength={100}
        className="h-11 rounded-[14px]"
        onChange={(e) => { setName(e.target.value); setNameTouched(true); clearError("name"); }}
        aria-invalid={!!errors.name}
        aria-describedby={errors.name ? `${formId}-name-error` : !isEdit ? `${formId}-name-hint` : undefined}
      />
      <FieldError id={`${formId}-name-error`} message={errors.name} />
      {!isEdit && !errors.name && (
        <p id={`${formId}-name-hint`} className="px-1 text-xs text-muted-foreground">
          Se genera solo con la marca, el banco y los dígitos. Puedes cambiarlo.
        </p>
      )}
    </div>
  );

  const colorField = (
    <div className="space-y-2">
      <span className={FIELD_LABEL}>Color de la tarjeta</span>
      <div role="radiogroup" aria-label="Color de la tarjeta" className={cn(OVERFLOW_ROW, "gap-2.5 py-1.5")}>
        {ACCOUNT_GRADIENTS.map((g) => {
          const selected = color === g.key;
          return (
            <button
              key={g.key}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={g.label}
              title={g.label}
              onClick={() => { haptic(); setColor(g.key); setColorTouched(true); }}
              className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform active:scale-90"
            >
              {selected && (
                <motion.span
                  layoutId={`${formId}-color-ring`}
                  className="absolute -inset-1 rounded-full ring-2 ring-foreground/70"
                  transition={SPRING}
                />
              )}
              <span className="h-full w-full rounded-full ring-1 ring-inset ring-white/20" style={{ background: g.gradient }} />
            </button>
          );
        })}
      </div>
    </div>
  );

  const rateModes: { value: RateMode; label: string }[] = [
    { value: "ea", label: "E.A." },
    { value: "mv", label: "m.v." },
  ];

  const rateField = (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={`${formId}-rate`} className={FIELD_LABEL}>Tasa de interés</label>
        {/* E.A. es como la publica el banco; m.v. es como se guarda */}
        <div role="radiogroup" aria-label="Tipo de tasa" className="flex rounded-[12px] bg-muted p-0.5">
          {rateModes.map((m) => {
            const active = rateMode === m.value;
            return (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => changeRateMode(m.value)}
                className={cn(
                  "relative rounded-[10px] px-2.5 py-1 text-xs transition-colors",
                  active ? "font-bold text-foreground" : "font-semibold text-muted-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId={`${formId}-rate-pill`}
                    className="absolute inset-0 rounded-[10px] bg-[var(--surface)] shadow-sm"
                    transition={SPRING}
                  />
                )}
                <span className="relative">{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <DecimalInput
        id={`${formId}-rate`}
        maxDecimals={2}
        min={0}
        max={rateMode === "ea" ? 300 : 100}
        placeholder={rateMode === "ea" ? "Ej: 28 (= 28% E.A.)" : "Ej: 2,08 (= 2,08% m.v.)"}
        value={interestRate}
        onChange={(v) => { setInterestRate(v); setRateTouched(true); }}
        className="h-11 rounded-[14px] font-mono-num"
        aria-describedby={`${formId}-rate-hint`}
      />
      <p id={`${formId}-rate-hint`} className="px-1 text-xs text-muted-foreground" aria-live="polite">
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
      <div className="space-y-6 @2xl:grid @2xl:grid-cols-[minmax(0,18rem)_1fr] @2xl:items-start @2xl:gap-8 @2xl:space-y-0">
        <div className="space-y-4 @2xl:sticky @2xl:top-0">
          {/* Vista previa en vivo: el plástico se va formando mientras se rellena */}
          <motion.div
            layout={!reduce}
            className="overflow-hidden rounded-[22px]"
            style={{ boxShadow: "0 18px 40px -16px oklch(0 0 0 / 0.45)" }}
            aria-label={`Vista previa: ${displayName || generatedName}`}
            role="img"
          >
            <CardFace
              brand={brand}
              lastFourDigits={lastFour}
              name={displayName || generatedName}
              color={color}
              trailing={limitNum > 0 && showTerms ? (
                <span className="font-mono-num shrink-0 font-bold">
                  {balanceNum > 0 && balanceNum <= limitNum
                    ? `Disponible ${formatCents(toCents(limitNum - balanceNum), currency)}`
                    : `Cupo ${formatCents(toCents(limitNum), currency)}`}
                </span>
              ) : undefined}
            />
          </motion.div>

          {/* Indicador de pasos — solo en creación */}
          {!isEdit && (
            <div className="space-y-2">
              <div className="flex gap-1.5" aria-hidden="true">
                {[1, 2].map((s) => (
                  <span key={s} className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                    <motion.span
                      className="block h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500"
                      initial={false}
                      animate={{ width: s <= step ? "100%" : "0%" }}
                      transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
                    />
                  </span>
                ))}
              </div>
              <p className="text-xs font-semibold text-muted-foreground" aria-live="polite">
                Paso {step} de 2 · {step === 1 ? "Tu tarjeta" : "Cupo y fechas"}
              </p>
            </div>
          )}
        </div>

        {/* Los pasos entran deslizándose en la dirección del avance */}
        <div className="relative">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={isEdit ? "edit" : step}
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: dir * 26 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: dir * -26 }}
              transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
              className="space-y-6"
            >
              {/* ─── Paso 1: identidad ─── */}
              {showIdentity && (
                <div className="space-y-6">
                  {isEdit ? (
                    <>
                      {nameField}
                      <div className="space-y-2">
                        <span className={FIELD_LABEL}>Banco · Marca · Últimos 4</span>
                        <p className="rounded-[14px] bg-muted px-3 py-2.5 text-sm text-foreground">
                          {card.bankName} · {CARD_BRAND_LABELS[card.brand ?? "otro"]} ···{card.lastFourDigits}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-[1fr_7.5rem] gap-3">
                        <div className="min-w-0 space-y-2">
                          <label htmlFor={`${formId}-bank`} className={FIELD_LABEL}>Banco</label>
                          <Select value={bankChoice} onValueChange={(v) => chooseBank(v as string | null)}>
                            <SelectTrigger
                              id={`${formId}-bank`}
                              ref={bankRef}
                              className="h-11 w-full rounded-[14px]"
                              aria-invalid={!!errors.bank && !isOtherBank}
                              aria-describedby={errors.bank && !isOtherBank ? `${formId}-bank-error` : undefined}
                            >
                              {/* Con children, Base UI ignora `placeholder`: el vacío se pinta aquí */}
                              <SelectValue className="truncate">
                                {(v: string | null) => v === null
                                  ? <span className="text-muted-foreground">Elige tu banco</span>
                                  : v === OTHER_BANK ? "Otro" : v}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {CARD_BANKS.map((b) => <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>)}
                              <SelectItem value={OTHER_BANK}>Otro</SelectItem>
                            </SelectContent>
                          </Select>
                          {!isOtherBank && <FieldError id={`${formId}-bank-error`} message={errors.bank} />}
                        </div>
                        <div className="space-y-2">
                          <label htmlFor={`${formId}-last4`} className={FIELD_LABEL}>Últimos 4</label>
                          <Input
                            id={`${formId}-last4`}
                            ref={last4Ref}
                            placeholder="1234"
                            maxLength={4}
                            value={lastFour}
                            inputMode="numeric"
                            pattern="\d{4}"
                            autoComplete="off"
                            className="h-11 rounded-[14px] font-mono-num tracking-[0.2em]"
                            onChange={(e) => { setLastFour(e.target.value.replace(/\D/g, "")); clearError("last4"); }}
                            required
                            aria-invalid={!!errors.last4}
                            aria-describedby={errors.last4 ? `${formId}-last4-error` : undefined}
                          />
                          <FieldError id={`${formId}-last4-error`} message={errors.last4} />
                        </div>
                      </div>

                      {/* "Otro": el banco se escribe a mano */}
                      {isOtherBank && (
                        <div className="space-y-2">
                          <div className="flex items-baseline justify-between gap-2">
                            <label htmlFor={`${formId}-bank-custom`} className={FIELD_LABEL}>Nombre del banco</label>
                            <span className="px-1 text-xs tabular-nums text-muted-foreground" aria-hidden="true">
                              {customBank.length}/{BANK_NAME_MAX}
                            </span>
                          </div>
                          <Input
                            id={`${formId}-bank-custom`}
                            ref={customBankRef}
                            value={customBank}
                            placeholder="Escribe el nombre del banco"
                            autoComplete="off"
                            maxLength={BANK_NAME_MAX}
                            className="h-11 rounded-[14px]"
                            onChange={(e) => { setCustomBank(e.target.value); clearError("bank"); }}
                            required
                            aria-invalid={!!errors.bank}
                            aria-describedby={errors.bank ? `${formId}-bank-error` : undefined}
                          />
                          <FieldError id={`${formId}-bank-error`} message={errors.bank} />
                        </div>
                      )}

                      <div className="space-y-2">
                        <span className={FIELD_LABEL}>Marca</span>
                        <div role="radiogroup" aria-label="Marca" className="grid grid-cols-5 gap-2">
                          {CARD_BRANDS.map((b) => {
                            const active = brand === b.value;
                            return (
                              <button
                                key={b.value}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                aria-label={b.label}
                                title={b.label}
                                onClick={() => { haptic(); setBrand(b.value); }}
                                className={cn(
                                  "relative flex h-12 items-center justify-center rounded-[14px] border transition-[border-color,transform] active:scale-95",
                                  active ? "border-transparent" : "border-border bg-[var(--surface-2)]",
                                )}
                              >
                                {active && (
                                  <motion.span
                                    layoutId={`${formId}-brand-pill`}
                                    className="absolute inset-0 rounded-[14px] bg-[color-mix(in_oklch,var(--os-lime)_14%,transparent)] ring-1 ring-inset ring-[color-mix(in_oklch,var(--os-lime)_45%,transparent)]"
                                    transition={SPRING}
                                  />
                                )}
                                <span className="relative flex items-center">
                                  {b.value === "otro"
                                    ? <span className="text-xs font-bold">{b.label}</span>
                                    : <BrandLogo brand={b.value} size={26} />}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {colorField}
                      {nameField}
                    </>
                  )}
                </div>
              )}

              {/* ─── Paso 2: cupo y fechas ─── */}
              {showTerms && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label htmlFor={`${formId}-limit`} className={FIELD_LABEL}>Cupo total</label>
                    <MoneyInput
                      id={`${formId}-limit`}
                      ref={limitRef}
                      placeholder="5.000.000"
                      inputMode="decimal"
                      value={creditLimit}
                      onChange={(v) => { setCreditLimit(v); clearError("limit"); }}
                      required
                      className="h-11 rounded-[14px] font-mono-num text-base"
                      aria-invalid={!!errors.limit}
                      aria-describedby={errors.limit ? `${formId}-limit-error` : undefined}
                    />
                    <FieldError id={`${formId}-limit-error`} message={errors.limit} />
                  </div>

                  {!isEdit && (
                    <div className="space-y-2">
                      <label htmlFor={`${formId}-balance`} className={FIELD_LABEL}>Deuda actual</label>
                      <MoneyInput
                        id={`${formId}-balance`}
                        ref={balanceRef}
                        placeholder="0"
                        inputMode="decimal"
                        value={initialBalance}
                        onChange={(v) => { setInitialBalance(v); clearError("balance"); }}
                        className="h-11 rounded-[14px] font-mono-num text-base"
                        aria-invalid={!!errors.balance}
                        aria-describedby={errors.balance ? `${formId}-balance-error` : `${formId}-balance-hint`}
                      />
                      <FieldError id={`${formId}-balance-error`} message={errors.balance} />
                      {!errors.balance && (
                        <p id={`${formId}-balance-hint`} className="px-1 text-xs text-muted-foreground">
                          Si la tarjeta ya tiene saldo usado, escríbelo para que el disponible sea correcto.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <label htmlFor={`${formId}-cutoff`} className={FIELD_LABEL}>Día de corte</label>
                        <Select value={cutoffDay} onValueChange={(v) => { if (v) setCutoffDay(v); }}>
                          <SelectTrigger id={`${formId}-cutoff`} className="h-11 w-full rounded-[14px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {days.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label htmlFor={`${formId}-payment`} className={FIELD_LABEL}>Día de pago</label>
                        <Select value={paymentDay} onValueChange={(v) => { if (v) setPaymentDay(v); }}>
                          <SelectTrigger id={`${formId}-payment`} className="h-11 w-full rounded-[14px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {days.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {/* Fechas reales: confirman que corte y pago quedaron bien entendidos */}
                    <p className="px-1 text-xs text-muted-foreground" aria-live="polite">
                      Próximo corte: <strong className="text-foreground">{shortDate.format(nextCutoffTs)}</strong>
                      {" · "}Pagas el <strong className="text-foreground">{shortDate.format(nextPaymentTs)}</strong>
                    </p>
                    {cutoffDay === paymentDay && (
                      <p role="status" className="px-1 text-xs text-warning-text">
                        El corte y el pago casi nunca caen el mismo día. Revisa que sean correctos.
                      </p>
                    )}
                  </div>

                  {billingOptions.length > 0 && (
                    <div className="space-y-2">
                      <span id={`${formId}-billing`} className={FIELD_LABEL}>La pagas desde</span>
                      <div role="radiogroup" aria-labelledby={`${formId}-billing`} className={OVERFLOW_ROW}>
                        {billingOptions.map((a) => (
                          <SourceChip
                            key={a._id}
                            selected={billingAccountId === a._id}
                            onSelect={() => { haptic(); setBillingChoice(billingAccountId === a._id ? null : a._id); }}
                            color={a.color}
                            name={a.name}
                            detail={a.bankName ?? a.currency}
                          />
                        ))}
                      </div>
                      <p className="px-1 text-xs text-muted-foreground">
                        {billingAccountId
                          ? "Saldrá elegida cuando vayas a pagar. Tócala otra vez para quitarla."
                          : "Opcional: la cuenta que saldrá elegida cuando vayas a pagar."}
                      </p>
                    </div>
                  )}

                  {isEdit ? (
                    <>
                      {rateField}
                      {colorField}
                    </>
                  ) : (
                    <div className="space-y-4">
                      <button
                        type="button"
                        onClick={() => { haptic(); setShowMore((v) => !v); }}
                        aria-expanded={showMore}
                        aria-controls={`${formId}-more`}
                        className="flex w-full items-center justify-between rounded-[14px] bg-[var(--surface-2)] px-3 py-2.5 text-sm font-semibold"
                      >
                        <span>
                          Más opciones{" "}
                          <span className="font-normal text-muted-foreground">
                            · {currency}
                            {interestRate ? ` · ${interestRate.replace(".", ",")}% ${rateMode === "ea" ? "E.A." : "m.v."}` : ""}
                          </span>
                        </span>
                        <motion.span animate={{ rotate: showMore ? 180 : 0 }} transition={{ duration: 0.2 }} className="flex">
                          <ChevronDown className="h-4 w-4" aria-hidden="true" />
                        </motion.span>
                      </button>
                      <AnimatePresence initial={false}>
                        {showMore && (
                          <motion.div
                            id={`${formId}-more`}
                            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                            animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
                            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
                            className="overflow-hidden"
                          >
                            <div className="space-y-6 pt-1">
                              <div className="space-y-2">
                                <label htmlFor={`${formId}-currency`} className={FIELD_LABEL}>Moneda</label>
                                <Select value={currency} onValueChange={(v) => { if (v) setCurrencyChoice(v); }}>
                                  <SelectTrigger id={`${formId}-currency`} className="h-11 w-full rounded-[14px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {CURRENCIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                              {rateField}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <AppSheetFooter>
        <div className="flex gap-2">
          {!isEdit && step === 2 && (
            <button
              type="button"
              onClick={() => { haptic(); setDir(-1); setStep(1); }}
              disabled={busy}
              className="h-12 flex-1 rounded-[16px] border border-border bg-[var(--surface-2)] text-[15px] font-bold text-foreground transition-transform active:scale-[0.98] disabled:opacity-40"
            >
              Atrás
            </button>
          )}
          <button
            type="submit"
            form={formId}
            disabled={busy}
            className="relative flex h-12 flex-1 items-center justify-center overflow-hidden rounded-[16px] bg-gradient-to-r from-emerald-400 to-teal-500 text-[15px] font-bold text-white shadow-[0_10px_24px_-10px_rgb(16_185_129/0.8)] transition-[opacity,transform] active:scale-[0.98] disabled:opacity-40"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={status === "idle" ? `idle-${step}` : status}
                className="flex items-center gap-2"
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.9 }}
                transition={{ duration: 0.18 }}
              >
                {status === "saving" && <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Guardando…</>}
                {status === "done" && <><Check className="h-5 w-5" strokeWidth={3} aria-hidden="true" /> Listo</>}
                {status === "idle" && (isEdit ? "Guardar cambios" : step === 1 ? "Siguiente" : "Crear tarjeta")}
              </motion.span>
            </AnimatePresence>
          </button>
        </div>
      </AppSheetFooter>
    </form>
  );
}
