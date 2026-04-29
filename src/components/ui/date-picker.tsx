"use client"

import * as React from "react"
import { format, parseISO, isValid } from "date-fns"
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
}

export function DatePicker({ value, onChange, id, required, className }: DatePickerProps) {
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
        className={className}
      />
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        className={cn(
          buttonVariants({ variant: "outline" }),
          "w-full justify-start text-left font-normal",
          !validDate && "text-muted-foreground",
          className
        )}
      >
        <CalendarIcon className="mr-2 h-4 w-4" />
        {validDate
          ? format(validDate, "d 'de' MMMM yyyy", { locale: es })
          : "Seleccionar fecha"}
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
        />
      </PopoverContent>
    </Popover>
  )
}
