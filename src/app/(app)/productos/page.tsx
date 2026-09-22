"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, Reorder, motion, useReducedMotion } from "framer-motion";
import { ArrowUpDown, Check, ChevronRight, CreditCard, Landmark, Plus, Search, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../../convex/_generated/api";
import { PageContainer } from "@/components/layout/PageContainer";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountSheet } from "@/components/accounts/AccountSheet";
import { AccountRow } from "@/components/accounts/AccountRow";
import { AccountsOverviewCard } from "@/components/accounts/AccountsOverviewCard";
import { EmptyState as AccountsEmptyState } from "@/components/accounts/EmptyState";
import {
  GROUP_LABELS,
  GROUP_ORDER,
  matchesQuery as accountMatches,
  type Account,
} from "@/components/accounts/shared";
import { CardSheet } from "@/components/cards/CardSheet";
import { CardRow } from "@/components/cards/CardRow";
import { PayCardSheet } from "@/components/cards/PayCardSheet";
import { dueOf, matchesQuery as cardMatches, type Card } from "@/components/cards/shared";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EASE_OUT_EXPO, GLASS_SURFACE, haptic } from "@/lib/ios";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/errorMessage";

export default function ProductosPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = use(searchParams);
  const router = useRouter();
  const reduce = useReducedMotion();

  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  // Se fija al montar: Date.now() en el render rompería la pureza del componente
  const [nowMs] = useState(() => Date.now());

  // ── Cuentas ──────────────────────────────────────────────────────────────
  const accounts = useQuery(api.accounts.list);
  const accountsOverview = useQuery(api.accounts.overview);
  const sharedAccounts = useQuery(api.accounts.listSharedWithMe);
  const setAccountArchived = useMutation(api.accounts.setArchived);
  const toggleInclude = useMutation(api.accounts.toggleBalanceInclusion);
  const reorderAccounts = useMutation(api.accounts.reorder);

  const [accountSheet, setAccountSheet] = useState<{ open: boolean; account: Account | null }>({ open: false, account: null });
  const [showArchivedAccounts, setShowArchivedAccounts] = useState(false);
  const archivedAccounts = useQuery(api.accounts.listArchived, showArchivedAccounts ? {} : "skip");

  // ── Tarjetas ─────────────────────────────────────────────────────────────
  const cards = useQuery(api.cards.list);
  const cardsOverview = useQuery(api.cards.overview);
  const setCardArchived = useMutation(api.cards.setArchived);
  const toggleCardIncludeMutation = useMutation(api.cards.toggleBalanceInclusion);
  const reorderCards = useMutation(api.cards.reorder);

  const [cardSheet, setCardSheet] = useState<{ open: boolean; card: Card | null }>({ open: false, card: null });
  const [payCard, setPayCard] = useState<Card | null>(null);
  const archivedCards = useQuery(api.cards.listArchived, showArchivedAccounts ? {} : "skip");

  // ── Orden local optimista ────────────────────────────────────────────────
  // El arrastre necesita reordenar al instante; la query llega después con el
  // orden ya guardado. Mismo patrón que la lista de categorías.
  const [accountItems, setAccountItems] = useState<Account[]>([]);
  const accountItemsRef = useRef<Account[]>([]);
  const [cardItems, setCardItems] = useState<Card[]>([]);
  const cardItemsRef = useRef<Card[]>([]);
  const [prevSource, setPrevSource] = useState<{ accounts: typeof accounts; cards: typeof cards }>();
  if (prevSource?.accounts !== accounts || prevSource?.cards !== cards) {
    setPrevSource({ accounts, cards });
    if (accounts !== undefined) setAccountItems(accounts);
    if (cards !== undefined) setCardItems(cards);
  }
  useEffect(() => { accountItemsRef.current = accountItems; }, [accountItems]);
  useEffect(() => { cardItemsRef.current = cardItems; }, [cardItems]);

  // Con un filtro activo la lista visible no es la real: arrastrar guardaría un
  // orden calculado sobre un subconjunto. Se sale del modo reordenar.
  const filtering = query.trim().length > 0;
  const reordering = editing && !filtering;

  const visibleAccounts = accountItems.filter((a) => accountMatches(a, query));
  const visibleCards = cardItems.filter((c) => cardMatches(c, query));
  const visibleShared = (sharedAccounts ?? []).filter(
    (a): a is NonNullable<typeof a> => a !== null && accountMatches(a, query)
  );

  const accountGroups = useMemo(
    () => GROUP_ORDER.map((type) => ({ type, items: visibleAccounts.filter((a) => a.type === type) }))
      .filter((g) => g.items.length > 0),
    // visibleAccounts se recalcula en cada render; la dependencia real es su contenido
    [accountItems, query] // eslint-disable-line react-hooks/exhaustive-deps
  );

  /** Tarjetas que ya vencieron o vencen esta semana: el aviso de arriba. */
  const urgentCards = useMemo(
    () => visibleCards.filter((c) => c.currentBalance > 0 && dueOf(c, nowMs).urgent),
    [cardItems, query, nowMs] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // `?tab=tarjetas` lo siguen usando el redirect de /tarjetas y el «volver» del
  // detalle de una tarjeta: ya no hay pestañas, así que lleva a su sección.
  const cardsSectionRef = useRef<HTMLElement>(null);
  const wantsCards = params.tab === "tarjetas";
  const cardsReady = cards !== undefined;
  useEffect(() => {
    if (wantsCards && cardsReady) cardsSectionRef.current?.scrollIntoView({ block: "start" });
  }, [wantsCards, cardsReady]);

  // ── Acciones de cuenta ───────────────────────────────────────────────────
  async function toggleAccountArchive(account: Account) {
    const archived = !account.archived;
    haptic(15);
    if (archived) setAccountItems((prev) => prev.filter((a) => a._id !== account._id));
    try {
      await setAccountArchived({ accountId: account._id, archived });
      toast(`«${account.name}» ${archived ? "archivada" : "restaurada"}`, {
        action: {
          label: "Deshacer",
          onClick: () => {
            setAccountArchived({ accountId: account._id, archived: !archived }).catch(() =>
              toast.error("No se pudo deshacer")
            );
          },
        },
      });
    } catch (err) {
      if (accounts) setAccountItems(accounts);
      toast.error(errorMessage(err, "No se pudo archivar"));
    }
  }

  async function toggleAccountInclude(account: Account) {
    const include = account.includeInBalance === false;
    haptic();
    try {
      await toggleInclude({ accountId: account._id, include });
      toast.success(
        include ? `«${account.name}» vuelve a sumar al total` : `«${account.name}» ya no suma al total`
      );
    } catch (err) {
      toast.error(errorMessage(err, "No se pudo cambiar"));
    }
  }

  function saveAccountOrder(groupIds: string[]) {
    haptic(8);
    reorderAccounts({ accountIds: groupIds as Account["_id"][] }).catch(() =>
      toast.error("No se pudo guardar el orden")
    );
  }

  /**
   * Devuelve la lista completa con el grupo reordenado en su sitio: se camina el
   * array y, al encontrar un miembro del grupo, se toma el siguiente del nuevo
   * orden. Así los demás grupos no se mueven.
   */
  function mergeGroup<T extends { _id: string }>(all: T[], group: T[], next: T[]): T[] {
    const ids = new Set(group.map((g) => g._id));
    let i = 0;
    return all.map((item) => (ids.has(item._id) ? next[i++] : item));
  }

  // ── Acciones de tarjeta ──────────────────────────────────────────────────
  async function toggleCardArchive(card: Card) {
    const archived = !card.archived;
    haptic(15);
    if (archived) setCardItems((prev) => prev.filter((c) => c._id !== card._id));
    try {
      await setCardArchived({ cardId: card._id, archived });
      toast(`«${card.name}» ${archived ? "archivada" : "restaurada"}`, {
        action: {
          label: "Deshacer",
          onClick: () => {
            setCardArchived({ cardId: card._id, archived: !archived }).catch(() =>
              toast.error("No se pudo deshacer")
            );
          },
        },
      });
    } catch (err) {
      if (cards) setCardItems(cards);
      toast.error(errorMessage(err, "No se pudo archivar"));
    }
  }

  async function toggleCardInclude(card: Card) {
    const include = card.includeInBalance === false;
    haptic();
    try {
      await toggleCardIncludeMutation({ cardId: card._id, include });
      toast.success(
        include ? `«${card.name}» vuelve a restar del total` : `«${card.name}» ya no resta del total`
      );
    } catch (err) {
      toast.error(errorMessage(err, "No se pudo cambiar"));
    }
  }

  const isLoading = accounts === undefined || cards === undefined;
  const isEmpty = accountItems.length === 0 && cardItems.length === 0 && visibleShared.length === 0;
  const totalProducts = accountItems.length + cardItems.length;
  // Con un filtro activo no se ofrece reordenar: el orden se calcularía sobre un
  // subconjunto de la lista.
  const canReorder = !filtering && (accountItems.length > 1 || cardItems.length > 1);
  const archivedCount =
    archivedAccounts !== undefined && archivedCards !== undefined
      ? archivedAccounts.length + archivedCards.length
      : undefined;

  return (
    <PageContainer className="space-y-5">
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-foreground">
            Mis productos
          </h1>
          <p className="text-sm text-muted-foreground">Dónde tienes tu dinero y lo que debes</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canReorder && (
            <button
              type="button"
              onClick={() => { haptic(); setEditing((v) => !v); setOpenRowId(null); }}
              aria-pressed={editing}
              aria-label={editing ? "Terminar de reordenar" : "Reordenar"}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full transition-[background-color,transform] active:scale-90",
                editing ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {editing ? <Check className="h-4.5 w-4.5" strokeWidth={2.5} /> : <ArrowUpDown className="h-4.5 w-4.5" />}
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Agregar producto"
              onClick={() => haptic()}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-[0_8px_20px_-8px_rgb(16_185_129/0.9)] transition-transform active:scale-90"
            >
              <Plus className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setAccountSheet({ open: true, account: null })} className="gap-2">
                <Landmark className="h-4 w-4" aria-hidden="true" />
                Cuenta
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCardSheet({ open: true, card: null })} className="gap-2">
                <CreditCard className="h-4 w-4" aria-hidden="true" />
                Tarjeta de crédito
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Buscador: aparece cuando hay suficientes productos para perderse */}
      {totalProducts > 3 && (
        <div className={cn("flex items-center gap-2 rounded-[16px] px-3", GLASS_SURFACE)}>
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, banco o últimos 4"
            aria-label="Buscar producto"
            className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/70 [&::-webkit-search-cancel-button]:hidden"
          />
          {filtering && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Borrar búsqueda"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-transform active:scale-90"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : isEmpty ? (
        <AccountsEmptyState onCreate={() => setAccountSheet({ open: true, account: null })} />
      ) : (
        <div className="space-y-5">
          {!filtering && (
            <AccountsOverviewCard
              data={accountsOverview}
              cards={cardsOverview && cardsOverview.count > 0 ? cardsOverview : undefined}
            />
          )}

          {!filtering && urgentCards.length > 0 && (
            <motion.p
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
              className="flex items-center gap-2 rounded-[18px] bg-[color-mix(in_oklch,var(--os-orange)_12%,transparent)] px-4 py-3 text-sm font-semibold text-foreground"
            >
              <TriangleAlert className="h-4 w-4 shrink-0" style={{ color: "var(--os-orange-text)" }} aria-hidden="true" />
              {urgentCards.length === 1
                ? `«${urgentCards[0].name}» ${dueOf(urgentCards[0], nowMs).text.toLowerCase()}`
                : `${urgentCards.length} tarjetas por pagar esta semana`}
            </motion.p>
          )}

          {filtering && visibleAccounts.length === 0 && visibleCards.length === 0 && visibleShared.length === 0 && (
            <NoResults query={query} />
          )}

          {accountGroups.map((group) => (
            <Group key={group.type} title={GROUP_LABELS[group.type]} count={group.items.length}>
              <div className={cn("rounded-[24px] p-1.5", GLASS_SURFACE)}>
                <Reorder.Group
                  axis="y"
                  values={group.items}
                  onReorder={(next) => {
                    setAccountItems((prev) => mergeGroup(prev, group.items, next));
                    accountItemsRef.current = mergeGroup(accountItemsRef.current, group.items, next);
                  }}
                  className="space-y-0.5"
                >
                  <AnimatePresence initial={false}>
                    {group.items.map((account, i) => (
                      <AccountRow
                        key={account._id}
                        account={account}
                        index={i}
                        editing={reordering}
                        openId={openRowId}
                        setOpenId={setOpenRowId}
                        onOpen={() => router.push(`/cuentas/${account._id}`)}
                        onEdit={() => setAccountSheet({ open: true, account })}
                        onToggleArchive={() => toggleAccountArchive(account)}
                        onToggleInclude={() => toggleAccountInclude(account)}
                        onDragEnd={() =>
                          saveAccountOrder(
                            accountItemsRef.current
                              .filter((a) => a.type === group.type)
                              .map((a) => a._id)
                          )
                        }
                      />
                    ))}
                  </AnimatePresence>
                </Reorder.Group>
              </div>
            </Group>
          ))}

          {visibleCards.length > 0 && (
            <Group ref={cardsSectionRef} title="Tarjetas de crédito" count={visibleCards.length}>
              <Reorder.Group
                axis="y"
                values={visibleCards}
                onReorder={(next) => {
                  setCardItems((prev) => mergeGroup(prev, visibleCards, next));
                  cardItemsRef.current = mergeGroup(cardItemsRef.current, visibleCards, next);
                }}
                className="space-y-3"
              >
                <AnimatePresence initial={false}>
                  {visibleCards.map((card, i) => (
                    <CardRow
                      key={card._id}
                      card={card}
                      index={i}
                      editing={reordering}
                      nowMs={nowMs}
                      openId={openRowId}
                      setOpenId={setOpenRowId}
                      onOpen={() => router.push(`/tarjetas/${card._id}`)}
                      onEdit={() => setCardSheet({ open: true, card })}
                      onToggleArchive={() => toggleCardArchive(card)}
                      onToggleInclude={() => toggleCardInclude(card)}
                      onPay={() => setPayCard(card)}
                      onDragEnd={() => {
                        haptic(8);
                        reorderCards({ cardIds: cardItemsRef.current.map((c) => c._id) }).catch(() =>
                          toast.error("No se pudo guardar el orden")
                        );
                      }}
                    />
                  ))}
                </AnimatePresence>
              </Reorder.Group>
            </Group>
          )}

          {visibleShared.length > 0 && (
            <Group title="Compartidas conmigo" count={visibleShared.length}>
              <div className={cn("rounded-[24px] p-1.5", GLASS_SURFACE)}>
                <Reorder.Group axis="y" values={visibleShared} onReorder={() => {}} className="space-y-0.5">
                  {visibleShared.map((account, i) => (
                    <AccountRow
                      key={account._id}
                      account={account}
                      index={i}
                      isShared
                      openId={openRowId}
                      setOpenId={setOpenRowId}
                      onOpen={() => router.push(`/cuentas/${account._id}`)}
                      onEdit={() => {}}
                      onToggleArchive={() => {}}
                      onToggleInclude={() => {}}
                      onDragEnd={() => {}}
                    />
                  ))}
                </Reorder.Group>
              </div>
            </Group>
          )}

          <ArchivedSection
            title="Archivados"
            open={showArchivedAccounts}
            onToggle={() => setShowArchivedAccounts((v) => !v)}
            count={archivedCount}
          >
            {archivedCount === 0 ? (
              <p className={cn("rounded-[20px] px-4 py-4 text-center text-sm text-muted-foreground", GLASS_SURFACE)}>
                No tienes cuentas ni tarjetas archivadas.
              </p>
            ) : (
              <div className="space-y-3">
                {(archivedAccounts ?? []).length > 0 && (
                  <div className={cn("rounded-[24px] p-1.5", GLASS_SURFACE)}>
                    <Reorder.Group axis="y" values={archivedAccounts ?? []} onReorder={() => {}} className="space-y-0.5">
                      {(archivedAccounts ?? []).map((account, i) => (
                        <AccountRow
                          key={account._id}
                          account={account}
                          index={i}
                          archived
                          openId={openRowId}
                          setOpenId={setOpenRowId}
                          onOpen={() => router.push(`/cuentas/${account._id}`)}
                          onEdit={() => setAccountSheet({ open: true, account })}
                          onToggleArchive={() => toggleAccountArchive(account)}
                          onToggleInclude={() => toggleAccountInclude(account)}
                          onDragEnd={() => {}}
                        />
                      ))}
                    </Reorder.Group>
                  </div>
                )}
                {(archivedCards ?? []).length > 0 && (
                  <Reorder.Group axis="y" values={archivedCards ?? []} onReorder={() => {}} className="space-y-3">
                    {(archivedCards ?? []).map((card, i) => (
                      <CardRow
                        key={card._id}
                        card={card}
                        index={i}
                        archived
                        nowMs={nowMs}
                        openId={openRowId}
                        setOpenId={setOpenRowId}
                        onOpen={() => router.push(`/tarjetas/${card._id}`)}
                        onEdit={() => setCardSheet({ open: true, card })}
                        onToggleArchive={() => toggleCardArchive(card)}
                        onDragEnd={() => {}}
                      />
                    ))}
                  </Reorder.Group>
                )}
              </div>
            )}
          </ArchivedSection>

          {!filtering && (
            <p className="px-1 text-center text-xs text-muted-foreground/80">
              Desliza una cuenta o tarjeta para editarla, sacarla del total o archivarla.
            </p>
          )}
        </div>
      )}

      {/* ── Hojas ────────────────────────────────────────────────────────── */}
      <AccountSheet
        open={accountSheet.open}
        onOpenChange={(open) => setAccountSheet((s) => ({ ...s, open }))}
        account={accountSheet.account}
      />

      <CardSheet
        open={cardSheet.open}
        onOpenChange={(open) => setCardSheet((s) => ({ ...s, open }))}
        card={cardSheet.card}
      />

      {/* Sin mínimo ni total: el listado no carga el ciclo, y la hoja no los calcula
          por su cuenta para no contradecir al detalle. */}
      {payCard && (
        <PayCardSheet
          card={payCard}
          open={payCard !== null}
          onOpenChange={(open) => { if (!open) setPayCard(null); }}
        />
      )}
    </PageContainer>
  );
}

// ─── Piezas de la lista ───────────────────────────────────────────────────────

function Group({
  title,
  count,
  children,
  ref,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  ref?: React.Ref<HTMLElement>;
}) {
  return (
    <section ref={ref} className="scroll-mt-24 space-y-2" aria-label={title}>
      <h2 className="flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
        <span className="rounded-full bg-muted px-1.5 text-[10px] font-bold tabular-nums">{count}</span>
      </h2>
      {children}
    </section>
  );
}

function NoResults({ query }: { query: string }) {
  return (
    <p className={cn("rounded-[24px] px-6 py-8 text-center text-sm text-muted-foreground", GLASS_SURFACE)}>
      Nada coincide con «{query.trim()}».
    </p>
  );
}

function ListSkeleton({ rows, tall }: { rows: number; tall?: boolean }) {
  return (
    <div className="space-y-4">
      <Skeleton className={cn("rounded-[28px]", tall ? "h-[152px]" : "h-[168px]")} />
      <div className={cn("space-y-1.5 rounded-[24px] p-2", GLASS_SURFACE)}>
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className={cn("rounded-[18px]", tall ? "h-[188px]" : "h-16")} />
        ))}
      </div>
    </div>
  );
}

function ArchivedSection({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count: number | undefined;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-1 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground pointer-coarse:min-h-11"
      >
        <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.2 }} className="flex">
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </motion.span>
        {title}
        {count !== undefined && count > 0 && (
          <span className="rounded-full bg-muted px-1.5 text-[11px] font-bold tabular-nums">{count}</span>
        )}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: EASE_OUT_EXPO }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
