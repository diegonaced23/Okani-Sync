"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/**
 * Campo para tasas, porcentajes y tipos de cambio.
 *
 * Por qué no `type="number"`: con `inputMode="decimal"` el teclado de iOS en
 * región Colombia solo ofrece coma, y un input numérico la rechaza. Por qué no
 * `MoneyInput`: agrupa miles con punto y corta a 2 decimales, así que "2.5"
 * escrito en una tasa acabaría siendo 25.
 *
 * Acepta punto o coma como separador decimal (el primero que aparezca), muestra
 * coma y emite el valor crudo con punto, listo para `parseFloat`. `min`/`max`
 * se aplican con la validación nativa del formulario, igual que antes.
 */
interface DecimalInputProps
  extends Omit<React.ComponentProps<"input">, "onChange" | "type" | "value" | "min" | "max"> {
  value: string
  onChange: (rawValue: string) => void
  maxDecimals?: number
  min?: number
  max?: number
}

const toDisplay = (raw: string) => raw.replace(".", ",")

function rangeMessage(num: number, min?: number, max?: number): string {
  const fmt = (n: number) => String(n).replace(".", ",")
  if (min !== undefined && num < min) return `El valor debe ser mayor o igual a ${fmt(min)}`
  if (max !== undefined && num > max) return `El valor debe ser menor o igual a ${fmt(max)}`
  return ""
}

export function DecimalInput({
  value,
  onChange,
  maxDecimals = 2,
  min,
  max,
  className,
  ...props
}: DecimalInputProps) {
  const ref = React.useRef<HTMLInputElement>(null)

  // La validez depende del valor, no del evento: así también cubre valores
  // iniciales (edición) y cambios hechos desde fuera del campo.
  React.useEffect(() => {
    const num = parseFloat(value)
    ref.current?.setCustomValidity(
      value === "" || Number.isNaN(num) ? "" : rangeMessage(num, min, max)
    )
  }, [value, min, max])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value
    const sep = text.search(/[.,]/)

    let raw: string
    if (sep < 0) {
      raw = text.replace(/\D/g, "")
    } else {
      const intDigits = text.slice(0, sep).replace(/\D/g, "")
      const decDigits = text.slice(sep + 1).replace(/\D/g, "").slice(0, maxDecimals)
      raw = maxDecimals > 0 ? `${intDigits || "0"}.${decDigits}` : intDigits
    }

    onChange(raw)
  }

  return (
    <Input
      {...props}
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className={cn("tabular-nums", className)}
      value={toDisplay(value)}
      onChange={handleChange}
    />
  )
}
