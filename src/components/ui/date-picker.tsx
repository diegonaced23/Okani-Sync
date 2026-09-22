"use client"

import * as React from "react"
import { addYears, endOfYear, format, parseISO, isValid } from "date-fns"
import { es } from "date-fns/locale"
import { CalendarIcon } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useMediaQuery } from "@/hooks/use-media-query"

interface DatePickerProps {
  value: string
  onChange: (value: string) => void
  id?: string
  required?: boolean
  className?: string
  style?: React.CSSProperties
}

// Con captionLayout="dropdown", react-day-picker corta el selector de año en
// el año actual si no recibe endMonth. Fechas límite y plazos viven en el
// futuro, así que se abre el rango con margen.
const YEARS_AHEAD = 30

export function DatePicker({ value, onChange, id, required, className, style }: DatePickerProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)")
  const [open, setOpen] = React.useState(false)

  const parsed = value ? parseISO(value) : undefined
  const validDate = parsed && isValid(parsed) ? parsed : undefined

  if (!isDesktop) {
    return (
      <Input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className={cn("w-full min-w-0 appearance-none", className)}
        style={style}
      />
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        aria-required={required}
        className={cn(
          buttonVariants({ variant: "outline" }),
          "w-full min-w-0 justify-start overflow-hidden text-left font-normal",
          !validDate && "text-muted-foreground",
          className
        )}
      >
        <CalendarIcon className="mr-2 h-4 w-4" />
        <span className="truncate">
          {validDate
            ? format(validDate, "d MMM yyyy", { locale: es })
            : "Seleccionar fecha"}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={validDate}
          onSelect={(d) => {
            onChange(d ? format(d, "yyyy-MM-dd") : "")
            setOpen(false)
          }}
          locale={es}
          captionLayout="dropdown"
          defaultMonth={validDate ?? new Date()}
          endMonth={endOfYear(addYears(new Date(), YEARS_AHEAD))}
        />
      </PopoverContent>
    </Popover>
  )
}
