import { Landmark, PiggyBank, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
import type { Doc } from "../../../convex/_generated/dataModel";

export type AccountType = Doc<"accounts">["type"];

/**
 * Tipos de cuenta según para qué la usa la persona, no según el nombre del producto
 * en el banco (en Colombia casi toda cuenta de nómina es legalmente "de ahorros").
 * Los literales de la BD no cambian: "bancaria" es la cuenta del día a día.
 *
 * Ojo: el tipo tiene efecto en los cálculos. Toda transferencia hacia una cuenta
 * "ahorros" cuenta como ahorro del mes (convex/accounts.ts).
 */
export const ACCOUNT_TYPE_META: Record<AccountType, {
  label: string;
  hint: string;
  icon: LucideIcon;
  /** Valor del campo `icon` que se guarda al crear */
  iconKey: string;
}> = {
  bancaria: {
    label: "Día a día",
    hint: "Donde recibes tu sueldo y desde la que pagas. Por lo general tiene tarjeta débito.",
    icon: Landmark,
    iconKey: "landmark",
  },
  ahorros: {
    label: "Ahorro",
    hint: "Dinero que apartas: bolsillos o ahorro programado. Lo que transfieras aquí cuenta como ahorro.",
    icon: PiggyBank,
    iconKey: "piggy-bank",
  },
  inversion: {
    label: "Inversión",
    hint: "CDT, fondos, acciones o cripto.",
    icon: TrendingUp,
    iconKey: "trending-up",
  },
  billetera: {
    label: "Efectivo",
    hint: "El dinero que llevas encima. No necesita banco.",
    icon: Wallet,
    iconKey: "wallet",
  },
};

/** Orden en el que se ofrecen en el formulario */
export const ACCOUNT_TYPE_ORDER: readonly AccountType[] = ["bancaria", "ahorros", "inversion", "billetera"];

/** Solo las cuentas de día a día y de ahorro tienen plástico (tarjeta débito). */
export function supportsDebitCard(type: AccountType) {
  return type === "bancaria" || type === "ahorros";
}

/** "Débito ···4521", "Débito" o undefined si la cuenta no tiene plástico. */
export function debitCardLabel(account: Pick<Doc<"accounts">, "hasDebitCard" | "debitCardLast4">) {
  if (!account.hasDebitCard) return undefined;
  return account.debitCardLast4 ? `Débito ···${account.debitCardLast4}` : "Débito";
}
