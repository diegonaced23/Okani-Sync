"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useKeyboardInset } from "@/hooks/use-keyboard-inset"
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
  /**
   * Reserva un pie fijo fuera del área con scroll. El contenido lo pinta el hijo
   * con <AppSheetFooter>, para que las acciones vivan junto al estado del formulario.
   * Sin esto, toda la hoja hace scroll (comportamiento de siempre).
   */
  footer?: boolean
}

// undefined = la hoja no reserva pie (se pinta en línea); null = el pie aún no montó
const FooterSlotContext = React.createContext<HTMLElement | null | undefined>(undefined)

/**
 * Renderiza sus hijos en el pie fijo de la AppSheet que lo contiene. Si la hoja no
 * tiene `footer`, o el componente se usa fuera de una AppSheet, se pinta en línea.
 */
export function AppSheetFooter({ children }: { children: React.ReactNode }) {
  const slot = React.useContext(FooterSlotContext)
  if (slot === undefined) return <div className="pt-4">{children}</div>
  return slot ? createPortal(children, slot) : null
}

export function AppSheet({
  open,
  onOpenChange,
  title,
  description,
  trigger,
  children,
  contentClassName,
  footer,
}: AppSheetProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)")
  const [footerSlot, setFooterSlot] = React.useState<HTMLDivElement | null>(null)

  // En móvil la hoja sale desde abajo y el teclado virtual la tapaba, pie incluido
  // (ver useKeyboardInset). Con el teclado abierto se apoya sobre él y se acorta a
  // lo visible, así el pie queda justo encima y el cuerpo sigue haciendo scroll.
  const keyboard = useKeyboardInset(open && !isDesktop)
  const keyboardStyle: React.CSSProperties | undefined = keyboard.inset
    ? {
        bottom: keyboard.inset,
        maxHeight: keyboard.visibleHeight - 12,
        transition: "bottom 0.22s ease-out, max-height 0.22s ease-out",
      }
    : undefined

  // Al acortarse la hoja, el campo enfocado puede quedar fuera del área con scroll
  React.useEffect(() => {
    if (!keyboard.inset) return
    const el = document.activeElement
    if (el instanceof HTMLElement && el.closest('[data-slot="sheet-content"]')) {
      el.scrollIntoView({ block: "nearest" })
    }
  }, [keyboard.inset, keyboard.visibleHeight])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger && <SheetTrigger render={trigger} />}
      <SheetContent
        side={isDesktop ? "right" : "bottom"}
        style={keyboardStyle}
        className={cn(
          isDesktop
            ? "overflow-x-hidden sm:max-w-md flex flex-col gap-0"
            : "max-h-[92dvh] overflow-x-hidden rounded-t-[28px] flex flex-col gap-0 transition-[max-height] duration-300 ease-out",
          // Con footer, el scroll pasa al cuerpo para que el pie quede siempre visible
          !footer && "overflow-y-auto",
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
        {footer ? (
          <>
            <div className={cn("flex-1 min-h-0 overflow-y-auto", isDesktop ? "px-6 pb-6 pt-2" : "px-5 pb-5 pt-2")}>
              <FooterSlotContext.Provider value={footerSlot}>{children}</FooterSlotContext.Provider>
            </div>
            <div ref={setFooterSlot} className={cn(
              "flex-shrink-0 border-t border-border bg-popover",
              isDesktop ? "px-6 py-4" : "px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
            )} />
          </>
        ) : (
          <div className={cn("flex-1", isDesktop ? "px-6 pb-8 pt-2" : "px-5 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-2")}>
            {children}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
