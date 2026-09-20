"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Archive, EyeOff, Pencil, Scale, Share2, Star, TrendingDown, Users } from "lucide-react";
import { ACCOUNT_GRADIENTS, GRADIENT_MAP } from "@/lib/constants";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ACCOUNT_TYPE_META, debitCardLabel } from "./accountTypes";
import { EASE_OUT_EXPO, GLASS_SURFACE, haptic, isExcluded, tint, type Account } from "./shared";

/**
 * Cabecera del detalle: la misma identidad visual que la ficha del listado —el
 * plástico con su color y su ícono— en vez del texto plano de antes, más el saldo
 * y las acciones. Eliminar no está aquí: vive en la zona de riesgo del pie.
 */
export function AccountHero({
  account,
  isOwner,
  onShare,
  onEdit,
  onAdjust,
  onArchive,
}: {
  account: Account;
  isOwner: boolean;
  onShare: () => void;
  onEdit: () => void;
  onAdjust: () => void;
  onArchive: () => void;
}) {
  const reduce = useReducedMotion();
  const g = GRADIENT_MAP[account.color] ?? ACCOUNT_GRADIENTS[0];
  const Icon = ACCOUNT_TYPE_META[account.type].icon;
  const negative = account.balance < 0;
  const excluded = isExcluded(account);

  const subtitle = [
    account.bankName,
    ACCOUNT_TYPE_META[account.type].label,
    account.accountNumber ? `···${account.accountNumber}` : undefined,
    debitCardLabel(account),
  ].filter(Boolean).join(" · ");

  const actions = [
    { key: "share", label: "Compartir", icon: Share2, onAction: onShare },
    { key: "edit", label: "Editar", icon: Pencil, onAction: onEdit },
    { key: "adjust", label: "Ajustar saldo", icon: Scale, onAction: onAdjust },
    ...(account.isDefault
      ? []
      : [{ key: "archive", label: "Archivar", icon: Archive, onAction: onArchive }]),
  ];

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
      className={cn("relative overflow-hidden rounded-[28px] p-5", GLASS_SURFACE)}
      aria-label={`Resumen de ${account.name}`}
    >
      {/* Halo con el color de la cuenta */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-14 -top-16 h-48 w-48 rounded-full opacity-30 blur-3xl"
        style={{ background: g.gradient }}
      />

      <div className="relative flex items-start gap-3.5">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] ring-1 ring-inset ring-white/15"
          style={{
            background: g.gradient,
            color: g.darkText ? "oklch(0.18 0.02 260)" : "white",
            boxShadow: "0 10px 26px -10px oklch(0 0 0 / 0.4)",
          }}
        >
          <Icon className="h-6 w-6" strokeWidth={2} />
        </span>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[22px] font-extrabold leading-tight tracking-tight text-foreground">
            {account.name}
          </h1>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>

        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
          {account.currency}
        </span>
      </div>

      <p
        className="relative mt-4 truncate font-mono-num text-[34px] font-extrabold leading-none tracking-tight tabular-nums"
        style={{ color: negative ? "var(--os-magenta)" : undefined }}
      >
        {formatCents(account.balance, account.currency)}
      </p>
      <p className="relative mt-1 text-xs text-muted-foreground">Saldo actual</p>

      {/* Insignias: lo que hay que saber de esta cuenta de un vistazo */}
      <div className="relative mt-3 flex flex-wrap gap-2">
        {account.isDefault && (
          <Badge icon={Star} tone="var(--os-orange)" text="var(--os-orange-text)">Por defecto</Badge>
        )}
        {account.isShared && (
          <Badge icon={Users} tone="var(--os-cyan)" text="var(--os-cyan-text)">Compartida</Badge>
        )}
        {excluded && <Badge icon={EyeOff}>Fuera del saldo total</Badge>}
        {negative && (
          <Badge icon={TrendingDown} tone="var(--os-magenta)" text="var(--os-magenta)">Sobregiro</Badge>
        )}
      </div>

      {/* La nota se guardaba y no se mostraba en ninguna pantalla */}
      {account.notes && (
        <p className="relative mt-3 rounded-[16px] bg-background/50 px-3 py-2.5 text-sm text-foreground dark:bg-white/5">
          {account.notes}
        </p>
      )}

      {isOwner && (
        <div className="relative mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-4">
          {actions.map((a) => {
            const ActionIcon = a.icon;
            return (
              <button
                key={a.key}
                type="button"
                onClick={() => { haptic(); a.onAction(); }}
                className="flex items-center gap-1.5 rounded-full bg-background/60 px-3 py-2 text-[13px] font-semibold text-foreground transition-[background-color,transform] hover:bg-background active:scale-95 dark:bg-white/8 dark:hover:bg-white/12"
              >
                <ActionIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {a.label}
              </button>
            );
          })}
        </div>
      )}
    </motion.section>
  );
}

function Badge({
  children,
  icon: Icon,
  tone,
  text,
}: {
  children: React.ReactNode;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  tone?: string;
  text?: string;
}) {
  return (
    <span
      className={cn(
        "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
        !tone && "bg-background/50 text-muted-foreground dark:bg-white/5",
      )}
      style={tone ? { background: tint(tone, 15), color: text ?? tone } : undefined}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {children}
    </span>
  );
}
