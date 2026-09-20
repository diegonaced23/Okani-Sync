"use client";

import { MoneyInput } from "@/components/ui/money-input";
import { FIELD_LABEL } from "@/lib/ios";
import { tint } from "./shared";

interface MoneyAmountFieldProps {
  id: string;
  label: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  ringColor: string;
  error?: string;
  fontSize?: number;
  padding?: string;
  required?: boolean;
  autoFocus?: boolean;
}

// Bloque Label + superficie con anillo de foco + MoneyInput + error inline,
// compartido entre los formularios de transacción, compra con tarjeta y transferencia.
export function MoneyAmountField({
  id,
  label,
  value,
  onChange,
  ringColor,
  error,
  fontSize = 32,
  padding = "18px 16px",
  required = true,
  autoFocus = false,
}: MoneyAmountFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-2">
      <label htmlFor={id} className={FIELD_LABEL}>
        {label}
      </label>
      <div
        className="flex items-center justify-center rounded-[22px] border border-white/40 focus-within:ring-2 focus-within:ring-ring dark:border-white/10"
        style={{
          // Tinte del color del tipo de movimiento, como la cabecera de las demás hojas
          background: `linear-gradient(160deg, ${tint(ringColor, 12)}, transparent 70%)`,
          padding,
          "--ring": ringColor,
        } as React.CSSProperties}
      >
        <MoneyInput
          id={id}
          value={value}
          onChange={onChange}
          placeholder="0"
          autoFocus={autoFocus}
          required={required}
          aria-required={required || undefined}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className="text-center border-none bg-transparent shadow-none focus-visible:ring-0 font-mono-num p-0 h-auto"
          style={{ fontSize, fontWeight: 800, letterSpacing: "-0.03em" }}
        />
      </div>
      {error && (
        <p id={errorId} role="alert" className="px-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
