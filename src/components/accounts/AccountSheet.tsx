"use client";

import { useId, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { AppSheet, AppSheetFooter } from "@/components/ui/app-sheet";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ACCOUNT_GRADIENTS, CURRENCIES, GRADIENT_MAP } from "@/lib/constants";
import { BANK_NAME_MAX, CARD_BANKS, findBank } from "@/lib/banks";
import { FIELD_LABEL, OVERFLOW_ROW } from "@/lib/ios";
import { toCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  ACCOUNT_TYPE_META,
  ACCOUNT_TYPE_ORDER,
  debitCardLabel,
  supportsDebitCard,
  type AccountType,
} from "./accountTypes";
import { SPRING, haptic, type Account } from "./shared";
import { errorMessage } from "@/lib/errorMessage";

const OTHER_BANK = "__otro__";

/** "Bancolombia · Día a día"; sin banco, solo el tipo. */
function suggestName(type: AccountType, bank: string) {
  const label = ACCOUNT_TYPE_META[type].label;
  return type === "billetera" || !bank ? label : `${bank} · ${label}`;
}

export function AccountSheet({
  open,
  onOpenChange,
  account,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = crear */
  account: Account | null;
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
      title={account ? "Editar cuenta" : "Nueva cuenta"}
      description={account ? undefined : "Dónde tienes este dinero"}
      footer
    >
      <AccountFields
        key={`${account?._id ?? "new"}-${session}`}
        account={account}
        onDone={() => onOpenChange(false)}
      />
    </AppSheet>
  );
}

function AccountFields({ account, onDone }: { account: Account | null; onDone: () => void }) {
  const formId = useId();
  const reduce = useReducedMotion();
  const isEdit = !!account;

  const me = useQuery(api.users.getMe);
  const create = useMutation(api.accounts.create);
  const update = useMutation(api.accounts.update);

  const [name, setName] = useState(account?.name ?? "");
  // Al crear, el nombre se sugiere con banco + tipo hasta que la persona lo escribe
  const [nameTouched, setNameTouched] = useState(isEdit);
  const [type, setType] = useState<AccountType>(account?.type ?? "bancaria");
  const [bankChoice, setBankChoice] = useState<string | null>(() => {
    if (!account?.bankName) return null;
    return findBank(account.bankName) ? account.bankName : OTHER_BANK;
  });
  const [customBank, setCustomBank] = useState(
    account?.bankName && !findBank(account.bankName) ? account.bankName : ""
  );
  const [accountNumber, setAccountNumber] = useState(account?.accountNumber ?? "");
  const [hasDebitCard, setHasDebitCard] = useState(account?.hasDebitCard ?? false);
  const [debitCardLast4, setDebitCardLast4] = useState(account?.debitCardLast4 ?? "");
  const [initialBalance, setInitialBalance] = useState("");
  // null = nadie la eligió: se resuelve con la preferencia del usuario, que en el
  // primer render todavía es undefined.
  const [currencyChoice, setCurrencyChoice] = useState<string | null>(null);
  const currency = currencyChoice ?? account?.currency ?? me?.currency ?? "COP";
  const [color, setColor] = useState(account?.color ?? ACCOUNT_GRADIENTS[0].key);
  const [colorTouched, setColorTouched] = useState(isEdit);
  const [status, setStatus] = useState<"idle" | "saving" | "done">("idle");

  const isCash = type === "billetera";
  const showDebitCard = supportsDebitCard(type);
  const isOtherBank = bankChoice === OTHER_BANK;
  const bankName = isCash ? "" : (isOtherBank ? customBank : bankChoice ?? "").trim();
  const displayName = nameTouched ? name : suggestName(type, bankName);
  const g = GRADIENT_MAP[color] ?? ACCOUNT_GRADIENTS[0];
  const TypeIcon = ACCOUNT_TYPE_META[type].icon;
  const canSubmit = displayName.trim().length > 0 && status === "idle";

  function chooseBank(value: string | null) {
    if (!value) return;
    haptic();
    setBankChoice(value);
    const known = findBank(value);
    if (known && !colorTouched) setColor(known.color);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const finalName = displayName.trim();
    setStatus("saving");

    // En edición un string vacío borra el dato; al crear se omite
    const bank = {
      bankName: isEdit ? bankName : bankName || undefined,
      accountNumber: isCash ? undefined : isEdit ? accountNumber : accountNumber || undefined,
      hasDebitCard: showDebitCard && hasDebitCard,
      debitCardLast4: showDebitCard && hasDebitCard ? debitCardLast4 : isEdit ? "" : undefined,
    };

    try {
      if (isEdit) {
        await update({ accountId: account._id, name: finalName, type, ...bank, color });
      } else {
        const balance = parseFloat(initialBalance.replace(/[^0-9.-]/g, "")) || 0;
        await create({
          name: finalName,
          type,
          ...bank,
          initialBalance: toCents(balance),
          currency,
          color,
          icon: ACCOUNT_TYPE_META[type].iconKey,
        });
      }
      haptic(15);
      setStatus("done");
      toast.success(isEdit ? "Cuenta actualizada" : "Cuenta creada");
      setTimeout(onDone, reduce ? 0 : 480);
    } catch (err) {
      setStatus("idle");
      toast.error(errorMessage(err, "No se pudo guardar"));
    }
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-6">
      {/* Vista previa en vivo: el plástico de la cuenta mientras se rellena */}
      <div className="relative flex flex-col items-center gap-3 pb-1 pt-2" aria-hidden="true">
        <span
          className="pointer-events-none absolute top-0 h-28 w-28 rounded-full opacity-45 blur-2xl transition-[background] duration-500"
          style={{ background: g.gradient }}
        />
        <span
          className="relative flex h-[72px] w-[72px] items-center justify-center rounded-[24px] ring-1 ring-inset ring-white/20 transition-[background] duration-300"
          style={{
            background: g.gradient,
            color: g.darkText ? "oklch(0.18 0.02 260)" : "white",
            boxShadow: "0 14px 34px -12px oklch(0 0 0 / 0.45), inset 0 1px 0 rgba(255,255,255,0.3)",
          }}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={type}
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.4, rotate: -20 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.4, rotate: 20 }}
              transition={reduce ? { duration: 0.12 } : { type: "spring", stiffness: 600, damping: 22 }}
              className="flex"
            >
              <TypeIcon className="h-8 w-8" strokeWidth={2} />
            </motion.span>
          </AnimatePresence>
        </span>
        <div className="relative flex flex-col items-center gap-1 text-center">
          <p
            className={cn(
              "max-w-[17rem] truncate text-lg font-extrabold tracking-tight",
              displayName.trim() ? "text-foreground" : "text-muted-foreground/60",
            )}
          >
            {displayName.trim() || "Nueva cuenta"}
          </p>
          <p className="max-w-[17rem] truncate text-xs text-muted-foreground">
            {[
              isCash ? ACCOUNT_TYPE_META.billetera.label : bankName || ACCOUNT_TYPE_META[type].label,
              accountNumber && !isCash ? `···${accountNumber}` : undefined,
              debitCardLabel({ hasDebitCard: showDebitCard && hasDebitCard, debitCardLast4 }),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>

      {/* Tipo de cuenta */}
      <div className="space-y-2">
        <span className={FIELD_LABEL}>¿Para qué la usas?</span>
        <div role="radiogroup" aria-label="Tipo de cuenta" className="grid grid-cols-2 gap-2">
          {ACCOUNT_TYPE_ORDER.map((t) => {
            const { label, icon: Icon } = ACCOUNT_TYPE_META[t];
            const active = type === t;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => { haptic(); setType(t); }}
                className={cn(
                  "relative flex items-center gap-2.5 rounded-[16px] border px-3 py-2.5 text-left text-[13px] font-semibold transition-[border-color,background-color,transform] active:scale-[0.97]",
                  active
                    ? "border-[var(--os-lime)]/50 bg-[color-mix(in_oklch,var(--os-lime)_12%,transparent)] text-foreground"
                    : "border-border bg-[var(--surface-2)] text-muted-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </div>
        <p className="px-1 text-xs text-muted-foreground">{ACCOUNT_TYPE_META[type].hint}</p>
      </div>

      {/* Banco y últimos 4 */}
      {!isCash && (
        <>
          <div className="grid grid-cols-[1fr_6.5rem] gap-3">
            <div className="min-w-0 space-y-2">
              <label htmlFor={`${formId}-bank`} className={FIELD_LABEL}>Banco</label>
              <Select value={bankChoice} onValueChange={(v) => chooseBank(v as string | null)}>
                <SelectTrigger id={`${formId}-bank`} className="h-11 w-full rounded-[14px]">
                  {/* Con children, Base UI ignora `placeholder`: el vacío se pinta aquí */}
                  <SelectValue className="truncate">
                    {(v: string | null) =>
                      v === null
                        ? <span className="text-muted-foreground">Elige tu banco</span>
                        : v === OTHER_BANK ? "Otro" : v}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {CARD_BANKS.map((b) => <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>)}
                  <SelectItem value={OTHER_BANK}>Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label htmlFor={`${formId}-number`} className={FIELD_LABEL}>Últimos 4</label>
              <Input
                id={`${formId}-number`}
                placeholder="1234"
                maxLength={4}
                inputMode="numeric"
                autoComplete="off"
                className="h-11 rounded-[14px] font-mono-num tracking-[0.2em]"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
              />
            </div>
          </div>

          {isOtherBank && (
            <div className="space-y-2">
              <label htmlFor={`${formId}-bank-custom`} className={FIELD_LABEL}>Nombre del banco</label>
              <Input
                id={`${formId}-bank-custom`}
                placeholder="Escribe el nombre del banco"
                autoComplete="off"
                maxLength={BANK_NAME_MAX}
                className="h-11 rounded-[14px]"
                value={customBank}
                onChange={(e) => setCustomBank(e.target.value)}
              />
            </div>
          )}
        </>
      )}

      {/* Tarjeta débito: es el plástico de esta misma cuenta, mismo saldo */}
      {showDebitCard && (
        <div className="space-y-3 rounded-[18px] border border-border bg-[var(--surface-2)] px-4 py-3">
          <label className="flex cursor-pointer items-center gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{
                background: "color-mix(in oklch, var(--os-cyan) 16%, transparent)",
                color: "var(--os-cyan-text)",
              }}
            >
              <CreditCard className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold text-foreground">Tiene tarjeta débito</span>
              <span className="block text-xs text-muted-foreground">Usa el mismo saldo de esta cuenta.</span>
            </span>
            <Switch checked={hasDebitCard} onCheckedChange={(v) => { haptic(); setHasDebitCard(v); }} />
          </label>
          {hasDebitCard && (
            <div className="space-y-2">
              <label htmlFor={`${formId}-debit`} className={FIELD_LABEL}>Últimos 4 del plástico</label>
              <Input
                id={`${formId}-debit`}
                placeholder="4521"
                maxLength={4}
                inputMode="numeric"
                autoComplete="off"
                className="h-11 w-32 rounded-[14px] font-mono-num tracking-[0.2em]"
                value={debitCardLast4}
                onChange={(e) => setDebitCardLast4(e.target.value.replace(/\D/g, ""))}
              />
            </div>
          )}
        </div>
      )}

      {/* Nombre */}
      <div className="space-y-2">
        <label htmlFor={`${formId}-name`} className={FIELD_LABEL}>Nombre de la cuenta</label>
        <Input
          id={`${formId}-name`}
          placeholder="Ej: Bancolombia · Día a día"
          value={displayName}
          onChange={(e) => { setName(e.target.value); setNameTouched(true); }}
          maxLength={100}
          required
          className="h-11 rounded-[14px]"
        />
      </div>

      {/* Saldo inicial y moneda: solo al crear */}
      {!isEdit ? (
        <>
          <div className="space-y-2">
            <label htmlFor={`${formId}-balance`} className={FIELD_LABEL}>Saldo actual</label>
            <MoneyInput
              id={`${formId}-balance`}
              placeholder="0"
              inputMode="decimal"
              value={initialBalance}
              onChange={setInitialBalance}
              className="h-11 rounded-[14px] font-mono-num text-base"
            />
            <p className="px-1 text-xs text-muted-foreground">
              Lo que hay hoy en la cuenta. Desde aquí se cuentan los movimientos.
            </p>
          </div>

          <div className="space-y-2">
            <span className={FIELD_LABEL}>Moneda</span>
            <Segmented
              label="Moneda"
              value={currency}
              onChange={(c) => { haptic(); setCurrencyChoice(c); }}
              options={CURRENCIES.map((c) => ({ value: c.code, label: c.code }))}
              small
            />
          </div>
        </>
      ) : (
        <p className="px-1 text-xs text-muted-foreground">
          La moneda ({account.currency}) no se puede cambiar: los movimientos ya registrados están en ella.
        </p>
      )}

      {/* Color del plástico */}
      <div className="space-y-2">
        <span className={FIELD_LABEL}>Color</span>
        <div role="radiogroup" aria-label="Color" className={cn(OVERFLOW_ROW, "gap-2.5 py-1.5")}>
          {ACCOUNT_GRADIENTS.map((grad) => {
            const selected = color === grad.key;
            return (
              <button
                key={grad.key}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={grad.label}
                title={grad.label}
                onClick={() => { haptic(); setColor(grad.key); setColorTouched(true); }}
                className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform active:scale-90"
              >
                {selected && (
                  <motion.span
                    layoutId={`${formId}-color-ring`}
                    className="absolute -inset-1 rounded-full ring-2 ring-foreground/70"
                    transition={SPRING}
                  />
                )}
                <span className="h-full w-full rounded-full ring-1 ring-inset ring-white/20" style={{ background: grad.gradient }} />
              </button>
            );
          })}
        </div>
      </div>

      <AppSheetFooter>
        <button
          type="submit"
          form={formId}
          disabled={!canSubmit}
          className="relative flex h-12 w-full items-center justify-center overflow-hidden rounded-[16px] bg-gradient-to-r from-emerald-400 to-teal-500 text-[15px] font-bold text-white shadow-[0_10px_24px_-10px_rgb(16_185_129/0.8)] transition-[opacity,transform] active:scale-[0.98] disabled:opacity-40"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={status}
              className="flex items-center gap-2"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.9 }}
              transition={{ duration: 0.18 }}
            >
              {status === "saving" && <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Guardando…</>}
              {status === "done" && <><Check className="h-5 w-5" strokeWidth={3} aria-hidden="true" /> Listo</>}
              {status === "idle" && (isEdit ? "Guardar cambios" : "Crear cuenta")}
            </motion.span>
          </AnimatePresence>
        </button>
      </AppSheetFooter>
    </form>
  );
}
