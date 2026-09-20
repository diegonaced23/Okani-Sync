"use client";

import { Check, Clock } from "lucide-react";
import { formatCents } from "@/lib/money";
import { cn, formatDateShort } from "@/lib/utils";
import { tint, type InstallmentLike } from "./shared";

/**
 * Cronograma de una compra: capital, interés y saldo restante de cada cuota.
 * El saldo restante lo devolvía el backend y no se pintaba en ninguna parte, y es
 * justo el dato que dice cuánto falta por amortizar después de cada pago.
 */
export function InstallmentSchedule({
  installments,
  currency,
}: {
  installments: InstallmentLike[];
  currency: string;
}) {
  const sorted = [...installments].sort((a, b) => a.installmentNumber - b.installmentNumber);
  const hasInterest = sorted.some((i) => (i.interestAmount ?? 0) > 0);
  const hasRemaining = sorted.some((i) => i.remainingPrincipal !== undefined);

  const totals = sorted.reduce(
    (acc, i) => ({
      principal: acc.principal + (i.principalAmount ?? 0),
      interest: acc.interest + (i.interestAmount ?? 0),
      amount: acc.amount + i.amount,
    }),
    { principal: 0, interest: 0, amount: 0 }
  );

  return (
    <div className="overflow-x-auto rounded-[14px] bg-[var(--surface-2)] px-3 py-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/70 text-left">
            <Th className="w-7">#</Th>
            <Th>Vence</Th>
            <Th right>Capital</Th>
            {hasInterest && <Th right>Interés</Th>}
            <Th right>Cuota</Th>
            {hasRemaining && <Th right>Falta</Th>}
            <Th className="w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {sorted.map((inst) => (
            <tr key={inst._id} className={cn("transition-colors", inst.paid && "opacity-50")}>
              <Td className="text-muted-foreground">{inst.installmentNumber}</Td>
              <Td>{formatDateShort(inst.dueDate)}</Td>
              <Td right style={{ color: "var(--os-cyan-text)" }}>
                {formatCents(inst.principalAmount ?? 0, currency)}
              </Td>
              {hasInterest && (
                <Td right style={{ color: "var(--os-orange-text)" }}>
                  {formatCents(inst.interestAmount ?? 0, currency)}
                </Td>
              )}
              <Td right className="font-bold">{formatCents(inst.amount, currency)}</Td>
              {hasRemaining && (
                <Td right className="text-muted-foreground">
                  {inst.remainingPrincipal !== undefined
                    ? formatCents(inst.remainingPrincipal, currency)
                    : "—"}
                </Td>
              )}
              <td className="py-2">
                {inst.paid ? (
                  <span
                    className="mx-auto flex h-5 w-5 items-center justify-center rounded-full"
                    style={{ background: tint("var(--os-lime)", 20), color: "var(--os-lime-text)" }}
                    title="Pagada"
                  >
                    <Check className="h-3 w-3" strokeWidth={3} aria-label="Pagada" />
                  </span>
                ) : (
                  <Clock className="mx-auto h-4 w-4 text-muted-foreground" aria-label="Pendiente" />
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-border/70">
          <tr>
            <Td colSpan={2} className="text-muted-foreground">Total</Td>
            <Td right className="font-semibold" style={{ color: "var(--os-cyan-text)" }}>
              {formatCents(totals.principal, currency)}
            </Td>
            {hasInterest && (
              <Td right className="font-semibold" style={{ color: "var(--os-orange-text)" }}>
                {formatCents(totals.interest, currency)}
              </Td>
            )}
            <Td right className="font-extrabold">{formatCents(totals.amount, currency)}</Td>
            {hasRemaining && <td />}
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Th({
  children,
  right,
  className,
}: {
  children?: React.ReactNode;
  right?: boolean;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "pb-2 text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground",
        right && "text-right",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  right,
  className,
  colSpan,
  style,
}: {
  children?: React.ReactNode;
  right?: boolean;
  className?: string;
  colSpan?: number;
  style?: React.CSSProperties;
}) {
  return (
    <td
      colSpan={colSpan}
      style={style}
      className={cn("py-2 font-mono-num text-xs tabular-nums", right && "text-right", className)}
    >
      {children}
    </td>
  );
}
