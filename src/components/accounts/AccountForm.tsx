"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { toCents } from "@/lib/money";
import { CURRENCIES, ACCOUNT_GRADIENTS } from "@/lib/constants";
import { BANK_NAME_MAX, CARD_BANKS, findBank } from "@/lib/banks";
import { cn } from "@/lib/utils";
import {
  ACCOUNT_TYPE_META,
  ACCOUNT_TYPE_ORDER,
  supportsDebitCard,
  type AccountType,
} from "./accountTypes";

interface AccountFormProps {
  account?: Doc<"accounts">;
  onSuccess?: () => void;
}

const OTHER_BANK = "__otro__";

/** "Bancolombia · Día a día"; sin banco, solo el tipo. */
function suggestName(type: AccountType, bank: string) {
  const label = ACCOUNT_TYPE_META[type].label;
  return type === "billetera" || !bank ? label : `${bank} · ${label}`;
}

export function AccountForm({ account, onSuccess }: AccountFormProps) {
  const isEdit = !!account;
  const createAccount = useMutation(api.accounts.create);
  const updateAccount = useMutation(api.accounts.update);

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
  const [currency, setCurrency] = useState(account?.currency ?? "COP");
  const [color, setColor] = useState<string>(account?.color ?? ACCOUNT_GRADIENTS[0].key);
  const [colorTouched, setColorTouched] = useState(isEdit);
  const [loading, setLoading] = useState(false);

  const isCash = type === "billetera";
  const showDebitCard = supportsDebitCard(type);
  const isOtherBank = bankChoice === OTHER_BANK;
  const bankName = isCash ? "" : (isOtherBank ? customBank : bankChoice ?? "").trim();
  const displayName = nameTouched ? name : suggestName(type, bankName);

  function chooseBank(value: string | null) {
    if (!value) return;
    setBankChoice(value);
    const known = findBank(value);
    if (known && !colorTouched) setColor(known.color);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const finalName = displayName.trim();
    if (!finalName) return;

    // En edición un string vacío borra el dato; al crear se omite
    const bank = {
      bankName: isEdit ? bankName : bankName || undefined,
      accountNumber: isCash ? undefined : isEdit ? accountNumber : accountNumber || undefined,
      hasDebitCard: showDebitCard && hasDebitCard,
      debitCardLast4: showDebitCard && hasDebitCard ? debitCardLast4 : isEdit ? "" : undefined,
    };

    setLoading(true);
    try {
      if (isEdit) {
        await updateAccount({
          accountId: account!._id as Id<"accounts">,
          name: finalName,
          type,
          ...bank,
          color,
        });
        toast.success("Cuenta actualizada");
      } else {
        const balanceNum = parseFloat(initialBalance.replace(/[^0-9.-]/g, "")) || 0;
        await createAccount({
          name: finalName,
          type,
          ...bank,
          initialBalance: toCents(balanceNum),
          currency,
          color,
          icon: ACCOUNT_TYPE_META[type].iconKey,
        });
        toast.success("Cuenta creada correctamente");
      }
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium leading-none mb-1.5">¿Para qué la usas?</legend>
        <div className="grid grid-cols-2 gap-2">
          {ACCOUNT_TYPE_ORDER.map((t) => {
            const { label, icon: Icon } = ACCOUNT_TYPE_META[t];
            return (
              <label
                key={t}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-xl border bg-transparent px-3 py-2.5",
                  "text-sm font-medium text-foreground transition-colors hover:bg-muted",
                  "has-checked:border-primary has-checked:bg-primary/10 has-checked:ring-1 has-checked:ring-primary",
                  "has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
                )}
              >
                <input type="radio" name="account-type" value={t}
                  checked={type === t} onChange={() => setType(t)}
                  aria-describedby="acc-type-hint"
                  className="sr-only" />
                <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
                {label}
              </label>
            );
          })}
        </div>
        <p id="acc-type-hint" className="text-xs text-muted-foreground">
          {ACCOUNT_TYPE_META[type].hint}
        </p>
      </fieldset>

      {!isCash && (
        <div className="grid grid-cols-[1fr_6.5rem] gap-3">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="acc-bank">Banco</Label>
            <Select value={bankChoice} onValueChange={(v) => chooseBank(v as string | null)}>
              <SelectTrigger id="acc-bank" className="w-full">
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
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acc-number">Últimos 4</Label>
            <Input
              id="acc-number"
              placeholder="1234"
              maxLength={4}
              inputMode="numeric"
              autoComplete="off"
              className="font-mono-num tracking-[0.2em]"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
            />
          </div>
        </div>
      )}

      {/* "Otro": el banco se escribe a mano */}
      {!isCash && isOtherBank && (
        <div className="-mt-1 space-y-1.5">
          <Label htmlFor="acc-bank-custom">Nombre del banco</Label>
          <Input
            id="acc-bank-custom"
            placeholder="Escribe el nombre del banco"
            autoComplete="off"
            maxLength={BANK_NAME_MAX}
            value={customBank}
            onChange={(e) => setCustomBank(e.target.value)}
          />
        </div>
      )}

      {/* La tarjeta débito es el plástico de esta misma cuenta: mismo saldo, solo dato visible */}
      {showDebitCard && (
        <div className="space-y-3 rounded-xl border px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Label htmlFor="acc-debit" className="cursor-pointer">Tiene tarjeta débito</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Usa el mismo saldo de esta cuenta.
              </p>
            </div>
            <Switch id="acc-debit" checked={hasDebitCard} onCheckedChange={setHasDebitCard} />
          </div>
          {hasDebitCard && (
            <div className="space-y-1.5">
              <Label htmlFor="acc-debit-last4">Últimos 4 del plástico (opcional)</Label>
              <Input
                id="acc-debit-last4"
                placeholder="4521"
                maxLength={4}
                inputMode="numeric"
                autoComplete="off"
                className="w-28 font-mono-num tracking-[0.2em]"
                value={debitCardLast4}
                onChange={(e) => setDebitCardLast4(e.target.value.replace(/\D/g, ""))}
              />
            </div>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="acc-name">Nombre de la cuenta <span aria-hidden="true" className="text-danger">*</span></Label>
        <Input
          id="acc-name"
          placeholder="Ej: Bancolombia · Día a día"
          value={displayName}
          onChange={(e) => { setName(e.target.value); setNameTouched(true); }}
          maxLength={100}
          required
        />
      </div>

      {/* Saldo inicial solo en creación */}
      {!isEdit && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="acc-balance">Saldo inicial</Label>
            <MoneyInput
              id="acc-balance"
              placeholder="0"
              value={initialBalance}
              onChange={setInitialBalance}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Moneda</Label>
            <Select value={currency} onValueChange={(v) => { if (v) setCurrency(v); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* En edición: moneda no editable */}
      {isEdit && (
        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs">Moneda</Label>
          <p className="text-sm px-3 py-2 rounded-md bg-muted text-foreground">{account!.currency}</p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Color</Label>
        <div className="flex flex-wrap gap-2">
          {ACCOUNT_GRADIENTS.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => { setColor(g.key); setColorTouched(true); }}
              title={g.label}
              className={cn(
                "touch-hit h-8 w-8 rounded-full border-2 transition-all",
                color === g.key ? "border-foreground scale-110 shadow-md" : "border-transparent"
              )}
              style={{ background: g.gradient }}
              aria-label={g.label}
              aria-pressed={color === g.key}
            />
          ))}
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear cuenta"}
      </Button>
    </form>
  );
}
