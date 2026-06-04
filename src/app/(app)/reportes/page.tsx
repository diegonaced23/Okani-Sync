"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TransactionItem } from "@/components/transactions/TransactionItem";
import { BudgetHistoryTable } from "@/components/reports/BudgetHistoryTable";
import { PillTabs } from "@/components/ui/pill-tabs";
import { generateCsv, generateFullLedgerCsv, downloadCsv } from "@/lib/reports";
import type { ReportRow, LedgerTx, LedgerMaps } from "@/lib/reports";
import { currentMonth, formatMonth, formatCents } from "@/lib/money";
import { lastNMonths } from "@/lib/utils";
import { BookOpen, FileDown, FileText } from "lucide-react";
import { toast } from "sonner";

type FilterType = "todos" | "ingreso" | "gasto";
type Tab = "extracto" | "historico";

const HISTORY_MONTHS = 6;

export default function ReportesPage() {
  const [tab, setTab] = useState<Tab>("extracto");
  const [month, setMonth] = useState(() => currentMonth());
  const [filterType, setFilterType] = useState<FilterType>("todos");
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const historyMonths = lastNMonths(HISTORY_MONTHS);

  const transactions = useQuery(api.transactions.listByMonth, { month });
  const ledgerTxs    = useQuery(api.transactions.listForExport, { months: [month] });
  const categories   = useQuery(api.categories.list, {});
  const accounts     = useQuery(api.accounts.list);
  const cards        = useQuery(api.cards.list);
  const me           = useQuery(api.users.getMe);
  const budgetHistory = useQuery(
    api.budgets.historicalComparison,
    tab === "historico" ? { months: historyMonths } : "skip"
  );

  const catMap = Object.fromEntries(
    (categories ?? []).map((c) => [c._id, c.name])
  );

  const filtered = (transactions ?? []).filter((tx) => {
    if (filterType === "todos") return true;
    return tx.type === filterType;
  });

  const rows: ReportRow[] = filtered.map((tx) => ({
    date: tx.date,
    description: tx.description,
    category: tx.categoryId ? (catMap[tx.categoryId] ?? "Sin categoría") : "Sin categoría",
    type: tx.type,
    amount: tx.amount,
    currency: tx.currency,
  }));

  const totalIngresos = rows.filter(r => r.type === "ingreso").reduce((s, r) => s + r.amount, 0);
  const totalGastos   = rows.filter(r => r.type === "gasto").reduce((s, r) => s + r.amount, 0);
  const currency      = me?.currency ?? "COP";

  function handleCsv() {
    if (rows.length === 0) { toast.error("No hay transacciones para exportar"); return; }
    const csv = generateCsv(rows);
    downloadCsv(csv, `okany-sync_${month}.csv`);
    toast.success(`CSV exportado — ${rows.length} registros`);
  }

  function handleFullLedger() {
    if (!ledgerTxs || ledgerTxs.length === 0) {
      toast.error("No hay movimientos para exportar");
      return;
    }
    const accMap: LedgerMaps["accounts"] = Object.fromEntries(
      (accounts ?? []).map((a) => [a._id, a.name])
    );
    const cardMap: LedgerMaps["cards"] = Object.fromEntries(
      (cards ?? []).map((c) => [c._id, { name: c.name, lastFour: c.lastFourDigits }])
    );
    const catMaps: LedgerMaps["cats"] = Object.fromEntries(
      (categories ?? []).map((c) => [c._id, c.name])
    );
    const maps: LedgerMaps = { accounts: accMap, cards: cardMap, cats: catMaps };
    const txs: LedgerTx[] = ledgerTxs.map((tx) => ({
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
    const csv = generateFullLedgerCsv(txs, maps);
    downloadCsv(csv, `libro_movimientos_${month}.csv`);
    toast.success(`Libro exportado — ${txs.length} movimientos`);
  }

  async function handlePdf() {
    if (rows.length === 0) { toast.error("No hay transacciones para exportar"); return; }
    setGeneratingPdf(true);
    try {
      const [{ pdf }, { default: ReportDoc }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/reports/ReportDocument"),
      ]);
      const element = (
        <ReportDoc
          rows={rows}
          period={formatMonth(month)}
          userName={me?.name ?? "Usuario"}
          currency={currency}
        />
      );
      const blob = await pdf(element).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `okany-sync_${month}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("PDF exportado correctamente");
    } catch (err) {
      toast.error("Error al generar PDF");
      console.error(err);
    } finally {
      setGeneratingPdf(false);
    }
  }

  const isLoading = transactions === undefined;

  const TABS: { key: Tab; label: string }[] = [
    { key: "extracto",  label: "Extracto" },
    { key: "historico", label: "Pres. histórico" },
  ];

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Reportes</h1>
      </div>

      {/* Navegación de tabs */}
      <PillTabs
        tabs={TABS}
        active={tab}
        onChange={setTab}
        ariaLabel="Sección de reportes"
      />

      {/* ── Tab: Presupuesto histórico ──────────────────────────────────────── */}
      {tab === "historico" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Comparación de presupuesto vs. gasto real de los últimos {HISTORY_MONTHS} meses.
            La tendencia (↓/↑) compara el % de ejecución del último mes vs. el anterior.
          </p>
          <BudgetHistoryTable
            result={budgetHistory}
            currency={currency}
          />
        </div>
      )}

      {/* ── Tab: Extracto (contenido existente) ────────────────────────────── */}
      {tab === "extracto" && (
      <>
      {/* Filtros */}
      <div className="rounded-xl bg-card border border-border p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="rep-month">Mes</Label>
            <Input id="rep-month" type="month" value={month}
              onChange={(e) => setMonth(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={filterType}
              onValueChange={(v) => { if (v) setFilterType(v as FilterType); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="ingreso">Solo ingresos</SelectItem>
                <SelectItem value="gasto">Solo gastos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Resumen */}
        {!isLoading && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Registros</p>
              <p className="text-lg font-bold text-foreground">{rows.length}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Ingresos</p>
              <p className="text-sm font-bold text-accent">{formatCents(totalIngresos, currency)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Gastos</p>
              <p className="text-sm font-bold text-danger">{formatCents(totalGastos, currency)}</p>
            </div>
          </div>
        )}

        {/* Botones de exportación */}
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 gap-2" onClick={handleCsv}
              disabled={isLoading || rows.length === 0}>
              <FileDown className="h-4 w-4" />
              Extracto CSV
            </Button>
            <Button variant="outline" className="flex-1 gap-2" onClick={handlePdf}
              disabled={isLoading || rows.length === 0 || generatingPdf}>
              <FileText className="h-4 w-4" />
              {generatingPdf ? "Generando…" : "Extracto PDF"}
            </Button>
          </div>
          <Button
            variant="outline"
            className="w-full gap-2 border-dashed"
            onClick={handleFullLedger}
            disabled={!ledgerTxs || ledgerTxs.length === 0}
          >
            <BookOpen className="h-4 w-4" />
            Libro completo (todos los tipos · Debe/Haber)
          </Button>
        </div>
      </div>

      {/* Vista previa */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Vista previa — {formatMonth(month)}
        </h2>
        <div className="rounded-xl bg-card border border-border overflow-hidden">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">
              Sin transacciones para los filtros seleccionados.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((tx) => (
                <li key={tx._id}>
                  <TransactionItem
                    transaction={tx}
                    categoryName={tx.categoryId ? catMap[tx.categoryId] : undefined}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      </>
      )}
    </div>
  );
}
