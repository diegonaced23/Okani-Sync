"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface MoneyInputProps
  extends Omit<React.ComponentProps<"input">, "onChange" | "type" | "value"> {
  value: string
  onChange: (rawValue: string) => void
}

// raw "1000000.50" → display "1.000.000,50"  (es-CO)
function toDisplay(raw: string): string {
  if (!raw) return ""
  const [intPart, decPart] = raw.split(".")
  const intFormatted = (intPart || "").replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  return decPart !== undefined ? `${intFormatted},${decPart}` : intFormatted
}

export function MoneyInput({ value, onChange, className, ...props }: MoneyInputProps) {
  const [display, setDisplay] = React.useState(() => toDisplay(value))
  const lastEmitted = React.useRef(value)

  React.useEffect(() => {
    if (value !== lastEmitted.current) {
      setDisplay(toDisplay(value))
      lastEmitted.current = value
    }
  }, [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    const lastComma = raw.lastIndexOf(",")

    let intDigits: string
    let decDigits: string | undefined

    if (lastComma >= 0) {
      intDigits = raw.slice(0, lastComma).replace(/[^0-9]/g, "")
      decDigits = raw.slice(lastComma + 1).replace(/[^0-9]/g, "").slice(0, 2)
    } else {
      intDigits = raw.replace(/[^0-9]/g, "")
      decDigits = undefined
    }

    const intFormatted = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
    const newDisplay =
      decDigits !== undefined ? `${intFormatted},${decDigits}` : intFormatted
    const rawValue =
      decDigits !== undefined ? `${intDigits}.${decDigits}` : intDigits

    setDisplay(newDisplay)
    lastEmitted.current = rawValue
    onChange(rawValue)
  }

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      className={cn("text-right tabular-nums", className)}
      value={display}
      onChange={handleChange}
    />
  )
}
