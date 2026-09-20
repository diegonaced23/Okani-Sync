// Componente PDF — debe cargarse con dynamic import (no SSR)
// Uso: const { default: ReportDocument } = await import("./ReportDocument")

import {
  Document, Page, Text, View, StyleSheet,
} from "@react-pdf/renderer";
import { BrandMark } from "@/components/pdf/BrandMark";
import type { CurrencyTotals, ReportRow } from "@/lib/reports";
import { txTypeLabel } from "@/lib/reports";
import { formatCents } from "@/lib/money";
import { formatDateShort } from "@/lib/utils";

const styles = StyleSheet.create({
  // El padding inferior deja sitio al pie fijo, que se dibuja sobre la página
  page: { paddingTop: 32, paddingHorizontal: 32, paddingBottom: 46, fontFamily: "Helvetica", fontSize: 9, color: "#1C1917" },
  header: { marginBottom: 20, flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#16A34A" },
  subtitle: { fontSize: 10, color: "#57534E", marginTop: 2 },
  period: { fontSize: 8, color: "#57534E", marginTop: 4 },

  warning: {
    padding: "6 8", borderRadius: 4, marginBottom: 12,
    backgroundColor: "#FEF2F2", borderWidth: 0.5, borderColor: "#DC2626",
  },
  warningText: { fontSize: 7.5, color: "#DC2626", fontFamily: "Helvetica-Bold" },

  currencyBlock: { marginBottom: 10 },
  currencyLabel: {
    fontSize: 7, fontFamily: "Helvetica-Bold", color: "#57534E",
    textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3,
  },
  summaryRow: { flexDirection: "row", gap: 12 },
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

  footer: {
    position: "absolute", bottom: 22, left: 32, right: 32,
    flexDirection: "row", justifyContent: "space-between",
    borderTopWidth: 0.5, borderTopColor: "#E7E5E4", paddingTop: 6,
    color: "#57534E", fontSize: 7,
  },
});

interface ReportDocumentProps {
  rows: ReportRow[];
  period: string;
  userName: string;
  /** Un bloque por moneda presente en el extracto */
  totals: CurrencyTotals[];
  /** Tope de filas que alcanzó la consulta: el extracto está incompleto */
  truncatedAt?: number;
}

export default function ReportDocument({
  rows,
  period,
  userName,
  totals,
  truncatedAt,
}: ReportDocumentProps) {
  return (
    <Document title={`Extracto Okany Sync — ${period}`} author="Okany Sync">
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <BrandMark size={34} />
          <View>
            <Text style={styles.title}>Okany Sync</Text>
            <Text style={styles.subtitle}>Extracto financiero — {userName}</Text>
            <Text style={styles.period}>Período: {period}</Text>
          </View>
        </View>

        {/* Un extracto recortado que no lo dice es un extracto incorrecto: el aviso
            viaja dentro del documento, no solo en la pantalla que lo generó. */}
        {truncatedAt !== undefined && (
          <View style={styles.warning}>
            <Text style={styles.warningText}>
              Extracto parcial: el período tiene más de {truncatedAt} movimientos y este
              documento incluye los {truncatedAt} más recientes.
            </Text>
          </View>
        )}

        {/* Resumen — un bloque por moneda. Antes era uno solo que sumaba los montos
            de todas las monedas y los imprimía con la moneda del perfil. */}
        {totals.map((t) => {
          const neto = t.income - t.expense;
          return (
            <View key={t.currency} style={styles.currencyBlock}>
              {totals.length > 1 && <Text style={styles.currencyLabel}>{t.currency}</Text>}
              <View style={styles.summaryRow}>
                {[
                  { label: "Entradas", value: formatCents(t.income, t.currency), color: "#16A34A" },
                  { label: "Salidas",  value: formatCents(t.expense, t.currency), color: "#DC2626" },
                  { label: "Neto",     value: formatCents(neto, t.currency), color: neto >= 0 ? "#16A34A" : "#DC2626" },
                ].map(({ label, value, color }) => (
                  <View key={label} style={styles.summaryBox}>
                    <Text style={styles.summaryLabel}>{label}</Text>
                    <Text style={[styles.summaryValue, { color }]}>{value}</Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })}

        {/* Tabla header — `fixed` lo repite en cada página. Sin esto, a partir de la
            segunda hoja las columnas quedaban sin nombre. */}
        <View style={styles.tableHeader} fixed>
          <Text style={styles.colDate}>Fecha</Text>
          <Text style={styles.colDesc}>Descripción</Text>
          <Text style={styles.colCat}>Categoría</Text>
          <Text style={styles.colType}>Tipo</Text>
          <Text style={styles.colAmount}>Monto</Text>
          <Text style={styles.colCur}>Mon.</Text>
        </View>

        {/* Filas — wrap={false} evita que una fila se parta entre dos páginas */}
        {rows.map((row, i) => (
          <View key={i} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]} wrap={false}>
            <Text style={styles.colDateBody}>{formatDateShort(row.date)}</Text>
            <Text style={styles.colDescBody}>
              {row.description.length > 40 ? row.description.slice(0, 37) + "…" : row.description}
            </Text>
            <Text style={styles.colCatBody}>{row.category}</Text>
            <Text style={styles.colTypeBody}>{txTypeLabel(row.type)}</Text>
            <Text style={[styles.colAmountBody, {
              color: row.type === "ingreso" ? "#16A34A" : "#1C1917",
            }]}>
              {formatCents(row.amount, row.currency)}
            </Text>
            <Text style={styles.colCurBody}>{row.currency}</Text>
          </View>
        ))}

        {/* Pie fijo con numeración: un extracto de varias hojas sin ella no se puede
            archivar ni comprobar que está completo. */}
        <View style={styles.footer} fixed>
          <Text>
            Okany Sync · {new Date().toLocaleDateString("es-CO")} · {rows.length}{" "}
            {rows.length === 1 ? "movimiento" : "movimientos"}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
