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
import { generateCsv, downloadCsv } from "@/lib/reports";
import type { ReportRow } from "@/lib/reports";
import { currentMonth, formatMonth, formatCents } from "@/lib/money";
import { FileDown, FileText } from "lucide-react";
import { toast } from "sonner";
import { pdf } from "@react-pdf/renderer";

type FilterType = "todos" | "ingreso" | "gasto";

export default function ReportesPage() {
  const [month, setMonth] = useState(() => currentMonth());
  const [filterType, setFilterType] = useState<FilterType>("todos");
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const transactions = useQuery(api.transactions.listByMonth, { month });
  const categories   = useQuery(api.categories.list, {});
  const me           = useQuery(api.users.getMe);

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

  async function handlePdf() {
    if (rows.length === 0) { toast.error("No hay transacciones para exportar"); return; }
    setGeneratingPdf(true);
    try {
      const { default: ReportDoc } = await import("@/components/reports/ReportDocument");
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

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground">Reportes</h1>

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
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 gap-2" onClick={handleCsv}
            disabled={isLoading || rows.length === 0}>
            <FileDown className="h-4 w-4" />
            Exportar CSV
          </Button>
          <Button variant="outline" className="flex-1 gap-2" onClick={handlePdf}
            disabled={isLoading || rows.length === 0 || generatingPdf}>
            <FileText className="h-4 w-4" />
            {generatingPdf ? "Generando…" : "Exportar PDF"}
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
    </div>
  );
}
