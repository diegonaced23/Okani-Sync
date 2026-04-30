// Componente PDF — debe cargarse con dynamic import (no SSR)
// Uso: const ReportDocument = dynamic(() => import('./ReportDocument'), { ssr: false })

import {
  Document, Page, Text, View, StyleSheet,
} from "@react-pdf/renderer";
import type { ReportRow } from "@/lib/reports";
import { formatCents } from "@/lib/money";
import { formatDateShort } from "@/lib/utils";

const TYPE_LABELS: Record<string, string> = {
  ingreso: "Ingreso",
  gasto: "Gasto",
  transferencia: "Transferencia",
  pago_tarjeta: "Pago tarjeta",
  pago_deuda: "Pago deuda",
};

const styles = StyleSheet.create({
  page: { padding: 32, fontFamily: "Helvetica", fontSize: 9, color: "#1C1917" },
  header: { marginBottom: 20 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#16A34A" },
  subtitle: { fontSize: 10, color: "#57534E", marginTop: 2 },
  period: { fontSize: 8, color: "#57534E", marginTop: 4 },
  summaryRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  summaryBox: {
    flex: 1, padding: 8, borderRadius: 6,
    backgroundColor: "#F5F5F4", alignItems: "center",
  },
  summaryLabel: { fontSize: 7, color: "#57534E", textTransform: "uppercase" },
  summaryValue: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 2 },
  tableHeader: {
    flexDirection: "row", backgroundColor: "#1C1917", padding: "5 8",
    borderRadius: "4 4 0 0",
  },
  tableRow: {
    flexDirection: "row", padding: "4 8", borderBottomWidth: 0.5,
    borderBottomColor: "#E7E5E4",
  },
  tableRowAlt: { backgroundColor: "#FAFAF9" },
  colDate:   { width: "13%", color: "#F5F5F5" },
  colDesc:   { width: "32%", color: "#F5F5F5" },
  colCat:    { width: "18%", color: "#F5F5F5" },
  colType:   { width: "14%", color: "#F5F5F5" },
  colAmount: { width: "15%", textAlign: "right", color: "#F5F5F5" },
  colCur:    { width: "8%",  color: "#F5F5F5" },
  colDateBody:   { width: "13%" },
  colDescBody:   { width: "32%" },
  colCatBody:    { width: "18%", color: "#57534E" },
  colTypeBody:   { width: "14%", color: "#57534E" },
  colAmountBody: { width: "15%", textAlign: "right", fontFamily: "Helvetica-Bold" },
  colCurBody:    { width: "8%",  color: "#57534E" },
  footer: { marginTop: 16, borderTopWidth: 0.5, borderTopColor: "#E7E5E4", paddingTop: 8,
            color: "#57534E", fontSize: 7 },
});

interface ReportDocumentProps {
  rows: ReportRow[];
  period: string;
  userName: string;
  currency: string;
}

export default function ReportDocument({ rows, period, userName, currency }: ReportDocumentProps) {
  const totalIngresos = rows.filter(r => r.type === "ingreso").reduce((s, r) => s + r.amount, 0);
  const totalGastos   = rows.filter(r => r.type === "gasto").reduce((s, r) => s + r.amount, 0);
  const neto = totalIngresos - totalGastos;

  return (
    <Document title={`Extracto Okany Sync — ${period}`} author="Okany Sync">
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Okany Sync</Text>
          <Text style={styles.subtitle}>Extracto financiero — {userName}</Text>
          <Text style={styles.period}>Período: {period}</Text>
        </View>

        {/* Resumen */}
        <View style={styles.summaryRow}>
          {[
            { label: "Ingresos", value: formatCents(totalIngresos, currency), color: "#16A34A" },
            { label: "Gastos",   value: formatCents(totalGastos, currency),   color: "#DC2626" },
            { label: "Neto",     value: formatCents(neto, currency),           color: neto >= 0 ? "#16A34A" : "#DC2626" },
          ].map(({ label, value, color }) => (
            <View key={label} style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>{label}</Text>
              <Text style={[styles.summaryValue, { color }]}>{value}</Text>
            </View>
          ))}
        </View>

        {/* Tabla header */}
        <View style={styles.tableHeader}>
          <Text style={styles.colDate}>Fecha</Text>
          <Text style={styles.colDesc}>Descripción</Text>
          <Text style={styles.colCat}>Categoría</Text>
          <Text style={styles.colType}>Tipo</Text>
          <Text style={styles.colAmount}>Monto</Text>
          <Text style={styles.colCur}>Mon.</Text>
        </View>

        {/* Filas */}
        {rows.map((row, i) => (
          <View key={i} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}>
            <Text style={styles.colDateBody}>{formatDateShort(row.date)}</Text>
            <Text style={styles.colDescBody}>
              {row.description.length > 40 ? row.description.slice(0, 37) + "…" : row.description}
            </Text>
            <Text style={styles.colCatBody}>{row.category}</Text>
            <Text style={styles.colTypeBody}>{TYPE_LABELS[row.type] ?? row.type}</Text>
            <Text style={[styles.colAmountBody, {
              color: row.type === "ingreso" ? "#16A34A" : "#1C1917",
            }]}>
              {formatCents(row.amount, row.currency)}
            </Text>
            <Text style={styles.colCurBody}>{row.currency}</Text>
          </View>
        ))}

        {/* Footer */}
        <Text style={styles.footer}>
          Generado por Okany Sync · {new Date().toLocaleDateString("es-CO")} ·
          {" "}{rows.length} transacciones
        </Text>
      </Page>
    </Document>
  );
}
