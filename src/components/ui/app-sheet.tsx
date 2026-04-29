"use client"

import * as React from "react"
import { useMediaQuery } from "@/hooks/use-media-query"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

interface AppSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /**
   * Elemento completo que se pasa como `render` al SheetTrigger (patrón Base UI).
   * Ejemplo: <Button size="sm"><Plus /> Nueva</Button>
   * Si se omite, el sheet es puramente controlado desde afuera (sin trigger interno).
   */
  trigger?: React.ReactElement
  children: React.ReactNode
  contentClassName?: string
}

export function AppSheet({
  open,
  onOpenChange,
  title,
  description,
  trigger,
  children,
  contentClassName,
}: AppSheetProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)")

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger && <SheetTrigger render={trigger} />}
      <SheetContent
        side={isDesktop ? "right" : "bottom"}
        className={cn(
          isDesktop
            ? "overflow-y-auto sm:max-w-md"
            : "max-h-[92dvh] overflow-y-auto rounded-t-[28px]",
          contentClassName
        )}
      >
        {/* Grabber visual — solo mobile */}
        {!isDesktop && (
          <div aria-hidden className="mx-auto mt-1 mb-1 flex justify-center">
            <span style={{ width: 40, height: 4, borderRadius: 9999, background: "var(--border-2, var(--border))", display: "block" }} />
          </div>
        )}
        <SheetHeader className="pb-4">
          <SheetTitle>{title}</SheetTitle>
          {description && (
            <SheetDescription>{description}</SheetDescription>
          )}
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  )
}
