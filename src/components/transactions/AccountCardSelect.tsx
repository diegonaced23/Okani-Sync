"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Check, ChevronRight, Star } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { AppSheet } from "@/components/ui/app-sheet";
import { SourceThumb } from "@/components/ui/source-chip";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { haptic } from "./shared";
import { errorMessage } from "@/lib/errorMessage";

interface AccountCardSelectProps {
  id?: string;
  /** Nombre accesible del campo: el visible cambia según el tipo de movimiento. */
  ariaLabel?: string;
  value: string; // codificado: "account:ID" | "card:ID"; "" mientras no se elija
  onValueChange: (v: string) => void;
  /** Solo lo que se pinta: así caben también las cuentas compartidas contigo */
  accounts: Pick<Doc<"accounts">, "_id" | "name" | "balance" | "currency" | "color">[];
  cards?: Doc<"cards">[];
  showCards?: boolean; // true para gastos; false para ingresos (solo cuentas)
  /** Título del selector; por defecto, según si admite tarjetas */
  title?: string;
  /**
   * false quita las estrellas: la favorita decide el origen de un gasto o ingreso,
   * y en otros formularios (p. ej. transferencias) marcarla ahí no tendría efecto.
   */
  allowFavorite?: boolean;
}

type Option = {
  value: string;
  name: string;
  detail: string;
  color: string;
  isCard: boolean;
};

/**
 * Origen del movimiento: una sola fila con lo elegido y, al tocarla, un selector
 * con todas las cuentas y tarjetas. Sustituye a la fila de fichas con scroll
 * lateral, que con seis productos obligaba a desplazarse para encontrar uno.
 *
 * En el selector, la estrella de cada fila marca la favorita: la que llega
 * seleccionada al abrir el formulario (ver resolveDefaultSource). No hay opción
 * «sin origen»: hasta que se elige, la fila invita a escoger y no se puede guardar.
 *
 * El valor sigue codificado como "account:ID" o "card:ID", así que los
 * formularios que lo consumen no cambiaron.
 */
export function AccountCardSelect({
  id,
  ariaLabel = "Origen",
  value,
  onValueChange,
  accounts,
  cards = [],
  showCards = false,
  title,
  allowFavorite = true,
}: AccountCardSelectProps) {
  const [open, setOpen] = useState(false);
  const me = useQuery(api.users.getMe, allowFavorite ? {} : "skip");
  const setFavorite = useMutation(api.users.setFavoriteSource);

  const accountOptions: Option[] = accounts.map((a) => ({
    value: `account:${a._id}`,
    name: a.name,
    detail: formatCents(a.balance, a.currency),
    color: a.color,
    isCard: false,
  }));
  const cardOptions: Option[] = showCards
    ? cards.map((c) => ({
        value: `card:${c._id}`,
        name: `${c.name} ····${c.lastFourDigits}`,
        detail: `${formatCents(c.availableCredit, c.currency)} disp.`,
        color: c.color,
        isCard: true,
      }))
    : [];

  const favorite = allowFavorite && me?.favoriteSource ? `${me.favoriteSource.kind}:${me.favoriteSource.id}` : "";
  const selected = [...accountOptions, ...cardOptions].find((o) => o.value === value);

  function pick(v: string) {
    haptic();
    onValueChange(v);
    setOpen(false);
  }

  async function toggleFavorite(o: Option) {
    haptic();
    const [kind, rawId] = o.value.split(":");
    const unset = favorite === o.value;
    try {
      await setFavorite({
        source: unset
          ? null
          : kind === "card"
            ? { kind: "card", id: rawId as Id<"cards"> }
            : { kind: "account", id: rawId as Id<"accounts"> },
      });
    } catch (err) {
      toast.error(errorMessage(err, "No se pudo guardar la favorita"));
    }
  }

  const prompt = showCards ? "Elige una cuenta o tarjeta" : "Elige una cuenta";

  return (
    <>
      <button
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-label={selected ? `${ariaLabel}: ${selected.name}. Cambiar` : `${ariaLabel}: ${prompt}`}
        onClick={() => { haptic(); setOpen(true); }}
        className={cn(
          "flex w-full items-center gap-3 rounded-[16px] px-3 py-2.5 text-left transition-transform active:scale-[0.985]",
          selected ? "bg-[var(--surface-2)]" : "border-[1.5px] border-dashed border-border",
        )}
      >
        {selected && <SourceThumb color={selected.color} name={selected.name} isCard={selected.isCard} size="lg" />}
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[14px] font-bold text-foreground">
            {selected ? selected.name : prompt}
          </span>
          <span className="mt-0.5 flex items-center gap-1 truncate text-[12px] tabular-nums text-muted-foreground">
            {selected ? (
              <>
                {selected.detail}
                {favorite === selected.value && (
                  <>
                    <span aria-hidden="true">·</span>
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                    Favorita
                  </>
                )}
              </>
            ) : (
              "Toca para ver todas"
            )}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      <AppSheet
        open={open}
        onOpenChange={setOpen}
        title={title ?? (showCards ? "¿De dónde sale?" : "¿A dónde llega?")}
        description={allowFavorite ? "La ★ elige cuál llega seleccionada la próxima vez." : undefined}
      >
        <div role="radiogroup" aria-label={ariaLabel} className="space-y-4">
          <OptionGroup
            title="Cuentas"
            options={accountOptions}
            value={value}
            favorite={favorite}
            onPick={pick}
            onToggleFavorite={allowFavorite ? toggleFavorite : undefined}
          />
          <OptionGroup
            title="Tarjetas de crédito"
            options={cardOptions}
            value={value}
            favorite={favorite}
            onPick={pick}
            onToggleFavorite={allowFavorite ? toggleFavorite : undefined}
          />
          {accountOptions.length + cardOptions.length === 0 && (
            <p className="rounded-[16px] bg-[var(--surface-2)] px-4 py-8 text-center text-sm text-muted-foreground">
              Aún no tienes cuentas activas. Crea una en Productos.
            </p>
          )}
        </div>
      </AppSheet>
    </>
  );
}

function OptionGroup({
  title,
  options,
  value,
  favorite,
  onPick,
  onToggleFavorite,
}: {
  title: string;
  options: Option[];
  value: string;
  favorite: string;
  onPick: (v: string) => void;
  /** Sin él no se pintan las estrellas */
  onToggleFavorite?: (o: Option) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{title}</p>
      <div className="space-y-1">
        {options.map((o) => {
          const isSelected = value === o.value;
          const isFavorite = favorite === o.value;
          return (
            <div
              key={o.value}
              className={cn(
                "flex items-center gap-1 rounded-[16px] pr-1.5 transition-colors",
                isSelected ? "bg-[var(--surface-2)] ring-[1.5px] ring-foreground/70" : "hover:bg-[var(--surface-2)]",
              )}
            >
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => onPick(o.value)}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-[16px] py-2.5 pl-3 pr-2 text-left active:scale-[0.985]"
              >
                <SourceThumb color={o.color} name={o.name} isCard={o.isCard} size="lg" />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-[14px] font-bold text-foreground">{o.name}</span>
                  <span className="block truncate text-[12px] tabular-nums text-muted-foreground">{o.detail}</span>
                </span>
                {isSelected && <Check className="h-4 w-4 shrink-0 text-foreground" strokeWidth={2.75} aria-hidden="true" />}
              </button>
              {onToggleFavorite && (
              <button
                type="button"
                aria-pressed={isFavorite}
                aria-label={isFavorite ? `Quitar ${o.name} como favorita` : `Marcar ${o.name} como favorita`}
                onClick={() => onToggleFavorite(o)}
                className="touch-hit grid h-10 w-10 shrink-0 place-items-center rounded-full transition-transform active:scale-90"
              >
                <Star
                  className={cn("h-[18px] w-[18px]", isFavorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground/70")}
                  aria-hidden="true"
                />
              </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
