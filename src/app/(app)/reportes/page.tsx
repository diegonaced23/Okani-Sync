"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { api } from "../../../../convex/_generated/api";
import { PageContainer } from "@/components/layout/PageContainer";
import { MonthStepper, shiftMonth } from "@/components/ui/month-stepper";
import { Skeleton } from "@/components/ui/skeleton";
import { TransactionItem } from "@/components/transactions/TransactionItem";
import { totalsByCurrency } from "@/components/transactions/shared";
import { BudgetHistoryTable } from "@/components/reports/BudgetHistoryTable";
import { EmptyState } from "@/components/reports/EmptyState";
import { ExportActions, type ExportAction } from "@/components/reports/ExportActions";
import { HorizonPicker } from "@/components/reports/HorizonPicker";
import {
  NetWorthHistoryCard,
  NetWorthHistoryCardSkeleton,
  type NetWorthPoint,
} from "@/components/reports/NetWorthHistoryCard";
import { StatementCard, StatementCardSkeleton } from "@/components/reports/StatementCard";
import {
  EASE_OUT_EXPO,
  GLASS_SURFACE,
  SPRING,
  STATEMENT_FILTERS,
  buildReportMaps,
  haptic,
  matchesFilter,
  monthsEndingAt,
  type StatementFilter,
} from "@/components/reports/shared";
import { generateCsv, generateFullLedgerCsv, downloadCsv } from "@/lib/reports";
import type { CurrencyTotals, ReportRow, LedgerTx } from "@/lib/reports";
import { currentMonth, formatMonth } from "@/lib/money";
import { cn } from "@/lib/utils";

type Tab = "extracto" | "patrimonio" | "presupuestos";

const TABS: { key: Tab; label: string }[] = [
  { key: "extracto",     label: "Extracto" },
  { key: "patrimonio",   label: "Patrimonio" },
  { key: "presupuestos", label: "Presupuestos" },
];

const SUBTITLES: Record<Tab, string> = {
  extracto:     "Revisa un mes y llévatelo en CSV o PDF",
  patrimonio:   "Cómo ha cambiado lo que tienes, mes a mes",
  presupuestos: "Presupuesto contra gasto real, mes a mes",
};

/** Horizontes que puede elegir el usuario. El backend acepta 12 meses en las
 *  comparaciones de presupuesto y 36 puntos en el histórico de patrimonio. */
const BUDGET_HORIZONS = [3, 6, 12];
const NET_WORTH_HORIZONS = [6, 12, 24];
const LEDGER_HORIZONS = [1, 3, 6, 12];

/** Hasta dónde puede retroceder el selector de mes, igual que en movimientos. */
const MONTHS_BACK = 24;

/** Filas que se pintan en la vista previa. El CSV y el PDF llevan todas: la lista
 *  no necesita montar dos mil nodos para que el usuario reconozca su mes. */
const PREVIEW_ROWS = 80;

export default function ReportesPage() {
  const reduce = useReducedMotion();

  const [tab, setTab] = useState<Tab>("extracto");
  const [month, setMonth] = useState(() => currentMonth());
  const [filter, setFilter] = useState<StatementFilter>("todos");
  const [budgetHorizon, setBudgetHorizon] = useState(6);
  const [netWorthHorizon, setNetWorthHorizon] = useState(12);
  const [ledgerHorizon, setLedgerHorizon] = useState(1);

  // El mes de hoy se fija al montar: leerlo en cada render rompería la pureza del
  // componente, y todos los rangos se derivan de él con aritmética sobre la cadena
  const [anchorMonth] = useState(() => currentMonth());
  const oldestMonth = shiftMonth(anchorMonth, -MONTHS_BACK);

  const budgetMonths = useMemo(
    () => monthsEndingAt(anchorMonth, budgetHorizon),
    [anchorMonth, budgetHorizon]
  );
  // El libro contable termina en el mes que se está viendo, no en el de hoy
  const ledgerMonths = useMemo(
    () => monthsEndingAt(month, ledgerHorizon),
    [month, ledgerHorizon]
  );

  // Una sola consulta para la vista previa, el CSV, el PDF y el libro contable.
  // Antes eran dos (listByMonth con techo de 300 y listForExport sin tope), así que
  // el «Extracto CSV» y el «Libro completo» del mismo mes podían no coincidir.
  const statement = useQuery(api.reports.statement, { months: [month] });
  const categories = useQuery(api.categories.list, {});
  const accounts   = useQuery(api.accounts.list);
  const cards      = useQuery(api.cards.list);
  const me         = useQuery(api.users.getMe);
  const budgetHistory = useQuery(
    api.budgets.historicalComparison,
    tab === "presupuestos" ? { months: budgetMonths } : "skip"
  );

  // Con rango de un mes el libro reutiliza la consulta del extracto; con más, pide
  // los meses que hagan falta en vez de exportar solo el mes visible.
  const ledgerStatement = useQuery(
    api.reports.statement,
    ledgerHorizon > 1 ? { months: ledgerMonths } : "skip"
  );
  const ledgerData = ledgerHorizon > 1 ? ledgerStatement : statement;

  // Histórico de patrimonio: los puntos archivados y la cifra de hoy, que el cron
  // todavía no ha guardado (captura el mes anterior el día 1).
  // El horizonte cuenta el mes en curso: «12 meses» son once archivados más hoy, que
  // es el punto que el cron todavía no ha guardado.
  const nwHistory = useQuery(
    api.reports.netWorthHistory,
    tab === "patrimonio"
      ? {
          fromMonth: shiftMonth(anchorMonth, -(netWorthHorizon - 1)),
          toMonth: anchorMonth,
        }
      : "skip"
  );
  const liveNetWorth = useQuery(api.accounts.netWorth, tab === "patrimonio" ? {} : "skip");

  // Categorías con emoji y color, y los nombres de cuentas y tarjetas. La pantalla
  // solo armaba un mapa de nombres de categoría, así que las filas salían sin icono
  // y las transferencias decían «Transferencia» en vez de «origen → destino».
  const maps = useMemo(
    () => buildReportMaps(categories, accounts, cards),
    [categories, accounts, cards]
  );

  // Memorizado porque `?? []` crea un array nuevo en cada render y arrastraría a
  // todos los useMemo que dependen de él
  const allTxs = useMemo(() => statement?.rows ?? [], [statement]);

  /** El mes alcanzó el tope: el conjunto que tenemos está incompleto. */
  const truncated = (statement?.truncatedMonths.length ?? 0) > 0;
  const cap = statement?.cap ?? 0;

  const filtered = useMemo(
    () => allTxs.filter((tx) => matchesFilter(tx, filter)),
    [allTxs, filter]
  );

  const rows: ReportRow[] = useMemo(
    () =>
      filtered.map((tx) => ({
        date: tx.date,
        description: tx.description,
        category: tx.categoryId
          ? (maps.categories[tx.categoryId]?.name ?? "Sin categoría")
          : "Sin categoría",
        type: tx.type,
        amount: tx.amount,
        currency: tx.currency,
      })),
    [filtered, maps]
  );

  // Totales por moneda, sin convertir: el mismo helper que usa la lista de
  // movimientos. Antes se sumaban centavos de monedas distintas y se etiquetaban
  // con la moneda del perfil, y solo contaban `type === "gasto"`.
  const totals: CurrencyTotals[] = useMemo(() => {
    const t = totalsByCurrency(filtered);
    return t.currencies
      .map((currency) => ({
        currency,
        income: t.income[currency] ?? 0,
        expense: t.expense[currency] ?? 0,
      }))
      .sort((a, b) => b.income + b.expense - (a.income + a.expense));
  }, [filtered]);

  /** Un archivo recortado tiene que decirlo en su propio nombre: se abre meses
   *  después, lejos del aviso de la pantalla que lo generó. Va en todos los archivos
   *  del mes truncado, incluso con filtro: el conjunto de partida está incompleto
   *  aunque el filtro dé un resultado que parezca cerrado. */
  const suffix = truncated ? "_parcial" : "";
  const monthLabel = formatMonth(month);

  function handleCsv() {
    const csv = generateCsv(rows);
    downloadCsv(csv, `okany-sync_${month}${suffix}.csv`);
    toast.success(
      truncated
        ? `CSV exportado — ${rows.length} registros (extracto parcial)`
        : `CSV exportado — ${rows.length} registros`
    );
  }

  function handleFullLedger() {
    // El libro contable va en orden ascendente: el saldo acumulado solo tiene
    // sentido leído hacia adelante.
    const txs: LedgerTx[] = [...(ledgerData?.rows ?? [])]
      .sort((a, b) => a.date - b.date)
      .map((tx) => ({
        _id:               tx._id,
        date:              tx.date,
        description:       tx.description,
        type:              tx.type,
        amount:            tx.amount,
        currency:          tx.currency,
        accountId:         tx.accountId,
        cardId:            tx.cardId,
        categoryId:        tx.categoryId,
        transferDirection: tx.transferDirection,
        notes:             tx.notes,
      }));
    const csv = generateFullLedgerCsv(txs, maps.ledger);
    const range = ledgerHorizon > 1 ? `${ledgerMonths[0]}_${month}` : month;
    const partial = (ledgerData?.truncatedMonths.length ?? 0) > 0 ? "_parcial" : "";
    downloadCsv(csv, `libro_movimientos_${range}${partial}.csv`);
    toast.success(
      partial
        ? `Libro exportado — ${txs.length} movimientos (parcial)`
        : `Libro exportado — ${txs.length} movimientos`
    );
  }

  async function handlePdf() {
    try {
      const [{ pdf }, { default: ReportDoc }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/reports/ReportDocument"),
      ]);
      const element = (
        <ReportDoc
          rows={rows}
          period={monthLabel}
          userName={me?.name ?? "Usuario"}
          totals={totals}
          truncatedAt={truncated ? cap : undefined}
        />
      );
      const blob = await pdf(element).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `okany-sync_${month}${suffix}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("PDF exportado correctamente");
    } catch (err) {
      toast.error("No se pudo generar el PDF");
      console.error(err);
      throw err;
    }
  }

  const isLoading = statement === undefined;
  const preview = filtered.slice(0, PREVIEW_ROWS);

  /**
   * Puntos del histórico más la cifra de hoy.
   *
   * El cron archiva el mes anterior el día 1, así que el mes en curso nunca está en
   * la tabla: se añade desde `accounts.netWorth`, la misma query que muestra el
   * dashboard, y se marca `live` para dibujarlo distinto. Si ya existe un punto
   * archivado de este mes (por una re-ejecución del cron), el vivo lo reemplaza:
   * es el mismo mes calculado más tarde.
   */
  const netWorthPoints: NetWorthPoint[] | undefined = useMemo(() => {
    if (nwHistory === undefined) return undefined;
    const stored = nwHistory.points.filter((p) => p.month !== anchorMonth);
    if (!liveNetWorth) return stored;
    return [
      ...stored,
      {
        month: anchorMonth,
        netWorth: liveNetWorth.netWorth,
        totalAssets: liveNetWorth.totalAssets,
        totalCardDebt: liveNetWorth.totalCardDebt,
        totalDebt: liveNetWorth.totalDebt,
        totalLoansReceivable: liveNetWorth.totalLoansReceivable,
        currency: liveNetWorth.currency,
        live: true,
      },
    ];
  }, [nwHistory, liveNetWorth, anchorMonth]);

  const exportActions: ExportAction[] = [
    {
      key: "csv",
      kind: "csv",
      label: "Extracto CSV",
      hint: `${rows.length} ${rows.length === 1 ? "registro" : "registros"} con lo que ves filtrado`,
      disabled: isLoading || rows.length === 0,
      run: handleCsv,
    },
    {
      key: "pdf",
      kind: "pdf",
      label: "Extracto PDF",
      hint: "Documento con resumen por moneda y numeración",
      disabled: isLoading || rows.length === 0,
      run: handlePdf,
    },
    {
      key: "ledger",
      kind: "ledger",
      label: "Libro contable",
      hint:
        // Al cambiar de rango la consulta vuelve a cargar: sin esto la fila se apaga
        // unos instantes sin decir por qué
        ledgerData === undefined
          ? "Cargando el rango…"
          : ledgerHorizon === 1
            ? "Todos los tipos del mes, con Debe, Haber y saldo"
            : `Todos los tipos de ${ledgerHorizon} meses, con Debe, Haber y saldo`,
      disabled: ledgerData === undefined || (ledgerData?.rows.length ?? 0) === 0,
      // El rango estaba fijo en un mes aunque el backend acepta doce
      extra: (
        <HorizonPicker
          value={ledgerHorizon}
          options={LEDGER_HORIZONS}
          onChange={setLedgerHorizon}
          label="Meses que abarca el libro contable"
          layoutId="reports-ledger-pill"
          size="sm"
        />
      ),
      run: handleFullLedger,
    },
  ];

  // El panel entra desde el lado que corresponde al salto entre pestañas, así que el
  // gesto coincide con el orden de la barra en vez de ser siempre el mismo
  const tabIndex = TABS.findIndex((t) => t.key === tab);
  const [prevIndex, setPrevIndex] = useState(tabIndex);
  const dir = tabIndex >= prevIndex ? 1 : -1;

  function switchTab(next: Tab) {
    if (next === tab) return;
    haptic();
    setPrevIndex(tabIndex);
    setTab(next);
  }

  return (
    <PageContainer className="space-y-5">
      <header className="min-w-0">
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-foreground">
          Reportes
        </h1>
        <p className="text-sm text-muted-foreground">{SUBTITLES[tab]}</p>
      </header>

      {/* Pestañas con la píldora que se desliza */}
      <div className="sticky top-[calc(64px+env(safe-area-inset-top))] z-30 lg:top-4">
        <div
          role="tablist"
          aria-label="Sección de reportes"
          className={cn(
            "flex rounded-[18px] p-1",
            GLASS_SURFACE,
            "md:bg-[color-mix(in_oklch,var(--card)_85%,transparent)] md:backdrop-blur-xl",
          )}
        >
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`tab-${t.key}`}
                aria-selected={active}
                aria-controls="module-panel"
                onClick={() => switchTab(t.key)}
                className={cn(
                  "touch-hit relative flex flex-1 items-center justify-center rounded-[14px] py-2 text-sm transition-colors",
                  active ? "font-bold text-foreground" : "font-semibold text-muted-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="module-tab-pill"
                    className="absolute inset-0 rounded-[14px] bg-[var(--surface)] shadow-[0_2px_10px_-4px_rgb(0_0_0/0.25)] dark:bg-white/10"
                    transition={SPRING}
                  />
                )}
                <span className="relative">{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div id="module-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="relative">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={tab}
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: dir * 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: dir * -28 }}
            transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
            className="space-y-5"
          >
            {tab === "extracto" ? (
              <>
                <MonthStepper
                  month={month}
                  onChange={setMonth}
                  minMonth={oldestMonth}
                  showToday
                />

                {/* Filtro por dirección de caja. Antes era un desplegable con «Solo
                    gastos», que filtraba `type === "gasto"` y escondía los gastos
                    con tarjeta. Es un grupo de opciones, no pestañas: mismo patrón
                    de accesibilidad que las píldoras de tipo en movimientos. */}
                <div
                  role="radiogroup"
                  aria-label="Filtrar el extracto"
                  className={cn("flex gap-1 rounded-[16px] p-1", GLASS_SURFACE)}
                  onKeyDown={(e) => {
                    const current = STATEMENT_FILTERS.findIndex((f) => f.key === filter);
                    let next = -1;
                    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                      e.preventDefault();
                      next = (current + 1) % STATEMENT_FILTERS.length;
                    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                      e.preventDefault();
                      next = (current - 1 + STATEMENT_FILTERS.length) % STATEMENT_FILTERS.length;
                    }
                    if (next !== -1) {
                      setFilter(STATEMENT_FILTERS[next].key);
                      (e.currentTarget.querySelectorAll('[role="radio"]')[next] as HTMLElement)?.focus();
                    }
                  }}
                >
                  {STATEMENT_FILTERS.map((f) => {
                    const active = filter === f.key;
                    return (
                      <button
                        key={f.key}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        tabIndex={active ? 0 : -1}
                        onClick={() => { haptic(); setFilter(f.key); }}
                        className={cn(
                          "touch-hit relative flex min-w-0 flex-1 items-center justify-center rounded-[12px] py-1.5 text-[13px] transition-colors",
                          active ? "font-bold text-foreground" : "font-semibold text-muted-foreground",
                        )}
                      >
                        {active && (
                          <motion.span
                            layoutId="reports-filter-pill"
                            className="absolute inset-0 rounded-[12px] bg-[var(--surface)] shadow-[0_2px_8px_-4px_rgb(0_0_0/0.25)] dark:bg-white/10"
                            transition={SPRING}
                          />
                        )}
                        <span className="relative">{f.label}</span>
                      </button>
                    );
                  })}
                </div>

                {isLoading ? (
                  <>
                    <StatementCardSkeleton />
                    <Skeleton className="h-[208px] rounded-[24px]" />
                    <div className={cn("space-y-1.5 rounded-[24px] p-2", GLASS_SURFACE)}>
                      {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-[62px] rounded-[18px]" />
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <StatementCard
                      totals={totals}
                      count={rows.length}
                      truncated={truncated}
                      cap={cap}
                      filtered={filter !== "todos"}
                      monthLabel={monthLabel}
                    />

                    <ExportActions actions={exportActions} />

                    {preview.length === 0 ? (
                      <EmptyState
                        monthLabel={monthLabel}
                        filtered={filter !== "todos" && allTxs.length > 0}
                        onClearFilter={() => { haptic(); setFilter("todos"); }}
                      />
                    ) : (
                      <section className="space-y-2">
                        <h2 className="px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                          Vista previa
                        </h2>
                        <div className={cn("rounded-[24px] p-1.5", GLASS_SURFACE)}>
                          <ul className="space-y-0.5">
                            {preview.map((tx, i) => (
                              <motion.li
                                key={tx._id}
                                initial={reduce ? false : { opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{
                                  duration: 0.3,
                                  ease: EASE_OUT_EXPO,
                                  // El retardo se corta pronto: con ochenta filas,
                                  // escalonarlas todas dejaría la última a dos segundos
                                  delay: Math.min(i, 12) * 0.025,
                                }}
                                className="overflow-hidden rounded-[18px]"
                              >
                                <TransactionItem
                                  transaction={tx}
                                  category={
                                    tx.categoryId ? maps.categories[tx.categoryId] : undefined
                                  }
                                  accountMap={maps.accounts}
                                  cardMap={maps.cards}
                                />
                              </motion.li>
                            ))}
                          </ul>
                        </div>
                        {/* La vista previa se corta, los archivos no: decirlo evita que
                            el usuario crea que el CSV llevará solo lo que ve. */}
                        {filtered.length > preview.length && (
                          <p className="px-1 text-[11px] text-muted-foreground">
                            Se muestran los {PREVIEW_ROWS} movimientos más recientes de{" "}
                            {filtered.length}. Las exportaciones incluyen todos.
                          </p>
                        )}
                      </section>
                    )}
                  </>
                )}
              </>
            ) : tab === "patrimonio" ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    Horizonte
                  </p>
                  <HorizonPicker
                    value={netWorthHorizon}
                    options={NET_WORTH_HORIZONS}
                    onChange={setNetWorthHorizon}
                    label="Meses del histórico de patrimonio"
                    layoutId="reports-networth-pill"
                  />
                </div>

                {nwHistory === undefined ? (
                  <NetWorthHistoryCardSkeleton />
                ) : (
                  <NetWorthHistoryCard
                    points={netWorthPoints}
                    currency={nwHistory.currency}
                    otherCurrencies={nwHistory.otherCurrencies}
                    missingRates={liveNetWorth?.missingRates ?? []}
                    liveMonth={anchorMonth}
                  />
                )}
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    Horizonte
                  </p>
                  <HorizonPicker
                    value={budgetHorizon}
                    options={BUDGET_HORIZONS}
                    onChange={setBudgetHorizon}
                    label="Meses de la comparación de presupuestos"
                    layoutId="reports-budget-pill"
                  />
                </div>
                <p className="px-1 text-sm text-muted-foreground">
                  La tendencia (↓/↑) compara el porcentaje de ejecución del último mes con
                  el anterior.
                </p>
                <BudgetHistoryTable result={budgetHistory} />
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </PageContainer>
  );
}
