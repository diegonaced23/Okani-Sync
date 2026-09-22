"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CheckIcon, InfoIcon, TriangleAlertIcon, XIcon, Loader2Icon } from "lucide-react"

/**
 * Avisos con el mismo vidrio líquido que la cápsula de confirmación: píldora
 * translúcida y el icono dentro de una gota de color según el tipo. El material
 * vive en `.os-toast` (globals.css) y no reutiliza `.os-liquid-glass` porque
 * Sonner ocupa los ::before/::after del aviso para el gesto de deslizar.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      // Por debajo de lg el BottomNav fijo tapa la esquina inferior: ver
      // --toast-offset-bottom en globals.css
      offset={{ bottom: "var(--toast-offset-bottom)" }}
      mobileOffset={{ bottom: "var(--toast-offset-bottom)" }}
      gap={10}
      icons={{
        success: <CheckIcon strokeWidth={3} />,
        info: <InfoIcon strokeWidth={2.5} />,
        warning: <TriangleAlertIcon strokeWidth={2.5} />,
        error: <XIcon strokeWidth={3} />,
        loading: <Loader2Icon strokeWidth={2.5} className="animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast: "os-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
