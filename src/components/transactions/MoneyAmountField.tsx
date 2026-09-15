"use client";

import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";

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
    <div>
      <Label htmlFor={id} className="text-[12px] font-semibold text-foreground mb-2 block">
        {label}
      </Label>
      <div
        className="flex items-center justify-center rounded-xl focus-within:ring-2 focus-within:ring-ring"
        style={{ background: "var(--surface-2)", padding, "--ring": ringColor } as React.CSSProperties}
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
          style={{ fontSize, fontWeight: 800, letterSpacing: "-0.025em" }}
        />
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-xs text-destructive mt-1.5">
          {error}
        </p>
      )}
    </div>
  );
}
