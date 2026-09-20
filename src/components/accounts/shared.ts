import type { Doc } from "../../../convex/_generated/dataModel";
import { ACCOUNT_TYPE_META, debitCardLabel, type AccountType } from "./accountTypes";

// Utilidades de estilo iOS compartidas con los demás módulos (viven en src/lib/ios.ts)
export { EASE_OUT_EXPO, GLASS_SURFACE, OVERFLOW_ROW, SPRING, haptic, tint } from "@/lib/ios";

export type Account = Doc<"accounts">;

/**
 * Forma mínima que necesita una fila del listado. Existe porque
 * `accounts.listSharedWithMe` proyecta un shape público —sin ownerId, notes ni
 * isDefault— para no filtrarle campos internos del dueño a un colaborador.
 */
export type AccountView = Pick<
  Account,
  "_id" | "name" | "type" | "balance" | "currency" | "color"
> &
  Partial<
    Pick<
      Account,
      | "bankName"
      | "accountNumber"
      | "hasDebitCard"
      | "debitCardLast4"
      | "isDefault"
      | "includeInBalance"
      | "archived"
    >
  >;

/**
 * Grupos del listado. El efectivo va último porque casi nadie lo usa como su
 * cuenta principal, y «Compartidas» no es un tipo: es de quién es la cuenta.
 */
export const GROUP_ORDER: readonly AccountType[] = ["bancaria", "ahorros", "inversion", "billetera"];

export const GROUP_LABELS: Record<AccountType, string> = {
  bancaria: "Día a día",
  ahorros: "Ahorro",
  inversion: "Inversión",
  billetera: "Efectivo",
};

/** "Itaú · ···9565 · Débito ···4521"; el efectivo no tiene banco ni número. */
export function accountSubtitle(account: AccountView): string {
  if (account.type === "billetera") return ACCOUNT_TYPE_META.billetera.label;
  return (
    [
      account.bankName,
      account.accountNumber ? `···${account.accountNumber}` : undefined,
      debitCardLabel(account),
    ]
      .filter(Boolean)
      .join(" · ") || ACCOUNT_TYPE_META[account.type].label
  );
}

/** Una cuenta excluida no suma al saldo consolidado; el listado tiene que decirlo. */
export function isExcluded(account: AccountView): boolean {
  return account.includeInBalance === false;
}

/** Filtra por nombre o banco. Cadena vacía = no filtra. */
export function matchesQuery(account: AccountView, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    account.name.toLowerCase().includes(q) ||
    (account.bankName ?? "").toLowerCase().includes(q)
  );
}

// ─── Cuentas compartidas ──────────────────────────────────────────────────────

export type SharePermission = "viewer" | "editor" | "admin";

/** Qué puede hacer cada nivel, en palabras y no en el enum de la base. */
export const PERMISSION_LABELS: Record<SharePermission, string> = {
  viewer: "Solo ver",
  editor: "Editor",
  admin: "Admin",
};

export const PERMISSION_HINTS: Record<SharePermission, string> = {
  viewer: "Ve saldos y movimientos, sin tocar nada.",
  editor: "Además registra y edita movimientos.",
  admin: "Además comparte la cuenta y edita sus datos.",
};

export const PERMISSION_ORDER: readonly SharePermission[] = ["viewer", "editor", "admin"];

/** El estado del share también se mostraba como enum crudo («aceptada»). */
export const SHARE_STATUS_LABELS: Record<string, string> = {
  pendiente: "Invitación pendiente",
  aceptada: "Con acceso",
  rechazada: "Invitación rechazada",
  revocada: "Acceso revocado",
};
