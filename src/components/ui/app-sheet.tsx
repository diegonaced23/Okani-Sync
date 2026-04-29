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
            ? "overflow-y-auto sm:max-w-md flex flex-col gap-0"
            : "max-h-[92dvh] overflow-y-auto rounded-t-[28px] flex flex-col gap-0",
          contentClassName
        )}
      >
        {/* Grabber — solo mobile */}
        {!isDesktop && (
          <div aria-hidden className="flex justify-center pt-2.5 pb-1 flex-shrink-0">
            <span style={{
              width: 36, height: 4, borderRadius: 9999,
              background: "var(--border-2, var(--border))", display: "block",
            }} />
          </div>
        )}

        {/* Header con título grande */}
        <SheetHeader className={cn("flex-shrink-0", isDesktop ? "px-6 pt-6 pb-2" : "px-5 pt-3 pb-2")}>
          <SheetTitle
            style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.025em", lineHeight: 1.2 }}
          >
            {title}
          </SheetTitle>
          {description && (
            <SheetDescription style={{ fontSize: 13, marginTop: 2 }}>
              {description}
            </SheetDescription>
          )}
        </SheetHeader>

        {/* Contenido con padding horizontal + espacio inferior generoso */}
        <div className={cn("flex-1", isDesktop ? "px-6 pb-8 pt-2" : "px-5 pb-10 pt-2")}>
          {children}
        </div>
      </SheetContent>
    </Sheet>
  )
}
