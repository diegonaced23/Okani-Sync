"use client";

import { memo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import type { Doc } from "../../../convex/_generated/dataModel";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountCard } from "@/components/accounts/AccountCard";
import { CardFace } from "@/components/cards/CardFace";
import { CardTilt } from "@/components/cards/CardTilt";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useBalanceHidden } from "@/hooks/use-balance-hidden";

interface ProductsCarouselProps {
  accounts: Doc<"accounts">[] | undefined;
  cards: Doc<"cards">[] | undefined;
}

const MASK = "$ ••••••";
// Todas las piezas del carrusel miden lo mismo: proporción de tarjeta física (ISO 7810, 1,586:1)
const TILE = "flex-none w-[264px] h-[166px] snap-start";
const rail = "flex gap-3 overflow-x-auto pb-2 pt-1 -mx-1 px-1 w-full min-w-0 list-none m-0 snap-x snap-mandatory accounts-carousel [scrollbar-width:none] [-webkit-overflow-scrolling:touch]";

/**
 * "Mis productos": una sola fila con las cuentas como fichas y las tarjetas de
 * crédito como plásticos con profundidad, para distinguirlas de un vistazo.
 */
export const ProductsCarousel = memo(function ProductsCarousel({ accounts, cards }: ProductsCarouselProps) {
  const router = useRouter();
  const [hidden] = useBalanceHidden();

  const loading = accounts === undefined || cards === undefined;
  const empty = !loading && accounts.length === 0 && cards.length === 0;

  return (
    <section className="md:col-span-2 space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-foreground">Mis productos</h2>
        <Link href="/productos" className="touch-hit inline-flex items-center gap-0.5 rounded-full bg-muted/70 px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground">
          Ver todos <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      {loading ? (
        <div className="flex gap-3 overflow-hidden pt-1">
          {[1, 2, 3].map((i) => <Skeleton key={i} className={cn(TILE, "rounded-[20px]")} />)}
        </div>
      ) : empty ? (
        <p className="text-sm text-muted-foreground py-3">No tienes cuentas ni tarjetas aún.</p>
      ) : (
        // Una sola fila: primero las cuentas (fichas), luego las tarjetas (plásticos)
        // Margen para la sombra y la inclinación 3D: el scroll horizontal recorta
        // también en vertical, así que el aire va dentro del contenedor (y se
        // compensa con -my para no separar la fila del resto)
        <ul
          role="list"
          // Focusable: el carril tiene scroll horizontal y sin esto las últimas
          // fichas solo se alcanzaban tabulando a ciegas. Mismo criterio que el
          // scroller de «Mes en curso».
          tabIndex={0}
          aria-label="Carrusel de cuentas y tarjetas"
          className={cn(rail, "-my-2 py-4 pb-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
        >
          {accounts.map((account) => (
            <li
              key={account._id}
              className={TILE}
              role="group"
              aria-label={
                hidden
                  ? `${account.name}, saldo oculto`
                  : `${account.name}, ${formatCents(account.balance, account.currency)}`
              }
            >
              <CardTilt className="h-full">
                <AccountCard
                  account={account}
                  variant="tile"
                  hideBalance={hidden}
                  onClick={() => router.push(`/cuentas/${account._id}`)}
                />
              </CardTilt>
            </li>
          ))}
          {cards.map((card) => <MiniCard key={card._id} card={card} hidden={hidden} />)}
        </ul>
      )}
    </section>
  );
});

function MiniCard({ card, hidden }: { card: Doc<"cards">; hidden: boolean }) {
  const available = Math.max(0, card.availableCredit);
  const availablePct = card.creditLimit > 0 ? Math.min(100, (available / card.creditLimit) * 100) : 0;
  const low = availablePct <= 20;

  return (
    <li className={TILE}>
      <Link
        href={`/tarjetas/${card._id}`}
        className="block h-full rounded-[20px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={hidden ? `${card.name}, saldos ocultos` : `${card.name}, disponible ${formatCents(available, card.currency)} de ${formatCents(card.creditLimit, card.currency)}`}
      >
        <CardTilt className="h-full">
          <CardFace
            className="h-full"
            brand={card.brand ?? "otro"}
            lastFourDigits={card.lastFourDigits}
            name={card.name}
            color={card.color}
            trailing={
              <span className="flex-shrink-0 text-right leading-tight">
                <span className="block text-[9px] font-semibold uppercase tracking-[0.1em] opacity-75">Disponible</span>
                <span className="block font-mono-num text-[13px] font-bold">
                  {hidden ? MASK : formatCents(available, card.currency)}
                </span>
                {/* Medidor del cupo disponible, del ancho del monto */}
                <span aria-hidden className="mt-1 block h-[3px] w-full overflow-hidden rounded-full bg-current/25">
                  <span
                    className={cn("block h-full rounded-full bar-fill", low ? "bg-[var(--warning)]" : "bg-current")}
                    // Con los saldos ocultos el medidor seguía revelando la proporción
                    style={{ width: hidden ? "0%" : `${availablePct}%` }}
                  />
                </span>
              </span>
            }
          />
        </CardTilt>
      </Link>
    </li>
  );
}
