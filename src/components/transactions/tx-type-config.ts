// Fuente única de verdad para la configuración visual de cada tipo de transacción.
// Importar desde aquí en todos los componentes para garantizar consistencia.
import type { LucideIcon } from "lucide-react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  CreditCard,
  HandCoins,
  Scale,
  Banknote,
} from "lucide-react";

export interface TxTypeConfig {
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  amountColor: string;
  sign: string;
  label: string;
}

export const TX_TYPE_CONFIG: Record<string, TxTypeConfig> = {
  ingreso: {
    icon: ArrowDownLeft,
    iconColor: "var(--os-lime)",
    iconBg: "color-mix(in oklch, var(--os-lime) 18%, transparent)",
    amountColor: "var(--os-lime)",
    sign: "+",
    label: "Ingreso",
  },
  gasto: {
    icon: ArrowUpRight,
    iconColor: "var(--os-magenta)",
    iconBg: "color-mix(in oklch, var(--os-magenta) 16%, transparent)",
    amountColor: "var(--os-magenta)",
    sign: "−",
    label: "Gasto",
  },
  transferencia: {
    icon: ArrowLeftRight,
    iconColor: "var(--os-cyan)",
    iconBg: "color-mix(in oklch, var(--os-cyan) 16%, transparent)",
    amountColor: "var(--muted-foreground)",
    sign: "",
    label: "Transferencia",
  },
  pago_tarjeta: {
    icon: ArrowLeftRight,
    iconColor: "var(--os-cyan)",
    iconBg: "color-mix(in oklch, var(--os-cyan) 16%, transparent)",
    amountColor: "var(--muted-foreground)",
    sign: "−",
    label: "Pago de tarjeta",
  },
  gasto_tarjeta: {
    icon: CreditCard,
    iconColor: "var(--os-cyan)",
    iconBg: "color-mix(in oklch, var(--os-cyan) 18%, transparent)",
    amountColor: "var(--os-magenta)",
    sign: "−",
    label: "Gasto con tarjeta",
  },
  pago_deuda: {
    icon: HandCoins,
    iconColor: "var(--os-orange)",
    iconBg: "color-mix(in oklch, var(--os-orange) 18%, transparent)",
    amountColor: "var(--os-magenta)",
    sign: "−",
    label: "Pago de deuda",
  },
  ajuste: {
    icon: Scale,
    iconColor: "var(--muted-foreground)",
    iconBg: "color-mix(in oklch, var(--muted-foreground) 12%, transparent)",
    amountColor: "var(--muted-foreground)",
    sign: "",
    label: "Reasignación bancaria",
  },
  prestamo_otorgado: {
    icon: Banknote,
    iconColor: "#6366F1",
    iconBg: "color-mix(in oklch, #6366F1 15%, transparent)",
    amountColor: "var(--os-magenta)",
    sign: "−",
    label: "Préstamo otorgado",
  },
  prestamo_cobrado: {
    icon: Banknote,
    iconColor: "var(--os-lime)",
    iconBg: "color-mix(in oklch, var(--os-lime) 15%, transparent)",
    amountColor: "var(--os-lime)",
    sign: "+",
    label: "Préstamo cobrado",
  },
};
