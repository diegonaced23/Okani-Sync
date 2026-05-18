// Documento PDF para el extracto de tarjeta de crédito.
// Debe cargarse con dynamic import (no SSR):
//   const { pdf } = await import("@react-pdf/renderer");
//   const { default: CardStatementDocument } = await import("@/components/cards/CardStatementDocument");

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { formatCents } from "@/lib/money";
import { formatDateShort } from "@/lib/utils";
import type { Doc } from "../../../convex/_generated/dataModel";

// ─── Estilos ─────────────────────────────────────────────────────────────────

const C = {
  ink:     "#1C1917",
  muted:   "#57534E",
  border:  "#E7E5E4",
  header:  "#1C1917",
  accent:  "#0D9488",   // teal — color principal de Okany Sync
  danger:  "#DC2626",
  surface: "#F5F5F4",
  white:   "#FFFFFF",
};

const s = StyleSheet.create({
  page:         { padding: 32, fontFamily: "Helvetica", fontSize: 9, color: C.ink, backgroundColor: C.white },

  // Encabezado del documento
  docHeader:    { marginBottom: 18 },
  appName:      { fontSize: 16, fontFamily: "Helvetica-Bold", color: C.accent },
  docTitle:     { fontSize: 10, color: C.muted, marginTop: 2 },

  // Bloque info de tarjeta
  cardBlock:    { flexDirection: "row", justifyContent: "space-between", marginBottom: 14,
                  paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: C.border },
  cardLeft:     { gap: 2 },
  cardName:     { fontSize: 12, fontFamily: "Helvetica-Bold" },
  cardNumber:   { fontSize: 9, color: C.muted },
  cardRight:    { alignItems: "flex-end", gap: 2 },
  cardBank:     { fontSize: 9, color: C.muted },
  cardPeriod:   { fontSize: 8, color: C.muted },

  // Cajas de resumen
  summarySection: { marginBottom: 16 },
  sectionTitle:   { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.muted,
                    textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 },
  summaryRow:   { flexDirection: "row", gap: 8 },
  summaryBox:   { flex: 1, padding: 8, borderRadius: 4, backgroundColor: C.surface, alignItems: "center" },
  summaryLabel: { fontSize: 6.5, color: C.muted, textTransform: "uppercase" },
  summaryValue: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 2 },
  summaryDate:  { fontSize: 7, color: C.muted, marginTop: 1 },

  // Tabla de compras
  tableSection: { marginBottom: 12 },
  tableHeader:  { flexDirection: "row", backgroundColor: C.header, padding: "5 8",
                  borderRadius: "4 4 0 0" },
  tableRow:     { flexDirection: "row", padding: "4 8",
                  borderBottomWidth: 0.5, borderBottomColor: C.border },
  tableRowAlt:  { backgroundColor: C.surface },
  tableRowOver: { backgroundColor: "#FEF2F2" },  // fondo rosado para vencidas

  // Columnas de la tabla
  cDesc:   { width: "34%", color: C.white },
  cCat:    { width: "16%", color: C.white },
  cDate:   { width: "11%", color: C.white },
  cInst:   { width: "9%",  color: C.white, textAlign: "center" },
  cMonth:  { width: "15%", color: C.white, textAlign: "right" },
  cTotal:  { width: "15%", color: C.white, textAlign: "right" },

  cDescB:  { width: "34%" },
  cCatB:   { width: "16%", color: C.muted },
  cDateB:  { width: "11%", color: C.muted },
  cInstB:  { width: "9%",  textAlign: "center" },
  cMonthB: { width: "15%", textAlign: "right", fontFamily: "Helvetica-Bold" },
  cTotalB: { width: "15%", textAlign: "right", fontFamily: "Helvetica-Bold" },

  // Tabla totales
  tableFoot:    { flexDirection: "row", justifyContent: "flex-end", gap: 24,
                  padding: "5 8", borderTopWidth: 1, borderTopColor: C.ink, marginTop: 0 },
  footLabel:    { fontSize: 7.5, color: C.muted },
  footValue:    { fontSize: 7.5, fontFamily: "Helvetica-Bold" },

  // Nota de vencidas
  overdueNote:  { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 8,
                  padding: "5 8", borderRadius: 4, backgroundColor: "#FEF2F2",
                  borderWidth: 0.5, borderColor: C.danger },
  overdueText:  { fontSize: 7.5, color: C.danger, fontFamily: "Helvetica-Bold" },

  // Pie de página
  footer:       { marginTop: 16, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: C.border,
                  flexDirection: "row", justifyContent: "space-between" },
  footerText:   { fontSize: 7, color: C.muted },
});

// ─── Props ───────────────────────────────────────────────────────────────────

interface CardStatementProps {
  card: Doc<"cards">;
  purchases: Doc<"cardPurchases">[];
  categoryMap: Record<string, string>;
  cycle: {
    prevCutoffTs: number;
    nextCutoffTs: number;
    prevPaymentTs: number;
    nextPaymentTs: number;
  };
  minimumPayment: number;
  totalPayment: number;
  hasOverdue: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BRAND_LABELS: Record<string, string> = {
  visa: "VISA",
  mastercard: "Mastercard",
  amex: "American Express",
  diners: "Diners Club",
  otro: "Tarjeta",
};

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// ─── Componente ──────────────────────────────────────────────────────────────

export default function CardStatementDocument({
  card,
  purchases,
  categoryMap,
  cycle,
  minimumPayment,
  totalPayment,
  hasOverdue,
}: CardStatementProps) {
  const currency = card.currency;
  const brand    = card.brand ? BRAND_LABELS[card.brand] : "Tarjeta";
  const now      = new Date();

  // Fecha de vencimiento relevante: mes anterior si hay cuotas vencidas, siguiente si no
  const paymentTs = hasOverdue ? cycle.prevPaymentTs : cycle.nextPaymentTs;

  // Total deuda de las compras activas
  const totalActive = purchases.reduce((s, p) => s + p.amountPerInstallment, 0);

  return (
    <Document
      title={`Extracto ${card.name} ···· ${card.lastFourDigits}`}
      author="Okany Sync"
    >
      <Page size="A4" style={s.page}>

        {/* ── Encabezado del documento ─────────────────────────────────────── */}
        <View style={s.docHeader}>
          <Text style={s.appName}>Okany Sync</Text>
          <Text style={s.docTitle}>Extracto de tarjeta de crédito</Text>
        </View>

        {/* ── Datos de la tarjeta ──────────────────────────────────────────── */}
        <View style={s.cardBlock}>
          <View style={s.cardLeft}>
            <Text style={s.cardName}>
              {card.name} ···· {card.lastFourDigits}
            </Text>
            <Text style={s.cardNumber}>
              {brand} · {currency} · Corte día {card.cutoffDay} · Pago día {card.paymentDay}
            </Text>
          </View>
          <View style={s.cardRight}>
            <Text style={s.cardBank}>{card.bankName}</Text>
            <Text style={s.cardPeriod}>
              Período: {formatDateShort(cycle.prevCutoffTs)} — {formatDateShort(cycle.nextCutoffTs)}
            </Text>
            <Text style={s.cardPeriod}>
              Generado el {formatDateShort(now.getTime())}
            </Text>
          </View>
        </View>

        {/* ── Nota de cuotas vencidas ──────────────────────────────────────── */}
        {hasOverdue && (
          <View style={s.overdueNote}>
            <Text style={s.overdueText}>
              ⚠  Tiene cuotas de ciclos anteriores sin pagar. Fecha de pago vencida:{" "}
              {formatDateShort(cycle.prevPaymentTs)}.
            </Text>
          </View>
        )}

        {/* ── Resumen financiero ───────────────────────────────────────────── */}
        <View style={s.summarySection}>
          <Text style={s.sectionTitle}>Resumen del período</Text>
          <View style={s.summaryRow}>
            {/* Saldo pendiente */}
            <View style={s.summaryBox}>
              <Text style={s.summaryLabel}>Saldo pendiente</Text>
              <Text style={[s.summaryValue, { color: C.danger }]}>
                {formatCents(card.currentBalance, currency)}
              </Text>
            </View>
            {/* Pago mínimo */}
            <View style={s.summaryBox}>
              <Text style={s.summaryLabel}>
                {hasOverdue ? "Pago mínimo (vencido)" : "Pago mínimo"}
              </Text>
              <Text style={[s.summaryValue, { color: hasOverdue ? C.danger : C.ink }]}>
                {formatCents(minimumPayment, currency)}
              </Text>
              <Text style={s.summaryDate}>Vence: {formatDateShort(paymentTs)}</Text>
            </View>
            {/* Pago total recomendado */}
            <View style={s.summaryBox}>
              <Text style={s.summaryLabel}>Pago total</Text>
              <Text style={[s.summaryValue, { color: C.ink }]}>
                {formatCents(totalPayment, currency)}
              </Text>
            </View>
            {/* Cupo disponible */}
            <View style={s.summaryBox}>
              <Text style={s.summaryLabel}>Disponible</Text>
              <Text style={[s.summaryValue, { color: C.accent }]}>
                {formatCents(card.availableCredit, currency)}
              </Text>
              <Text style={s.summaryDate}>
                Límite: {formatCents(card.creditLimit, currency)}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Tabla de compras activas ─────────────────────────────────────── */}
        <View style={s.tableSection}>
          <Text style={s.sectionTitle}>
            Compras activas ({purchases.length})
            {"  "}·{"  "}
            Cuota mensual total: {formatCents(totalActive, currency)}
          </Text>

          {/* Cabecera */}
          <View style={s.tableHeader}>
            <Text style={s.cDesc}>Descripción</Text>
            <Text style={s.cCat}>Categoría</Text>
            <Text style={s.cDate}>Fecha</Text>
            <Text style={s.cInst}>Cuotas</Text>
            <Text style={s.cMonth}>Cuota/mes</Text>
            <Text style={s.cTotal}>Total</Text>
          </View>

          {/* Filas de compras ordenadas por fecha de compra (más antigua primero) */}
          {[...purchases]
            .sort((a, b) => a.purchaseDate - b.purchaseDate)
            .map((p, i) => (
              <View
                key={p._id}
                style={[
                  s.tableRow,
                  i % 2 === 1 ? s.tableRowAlt : {},
                ]}
              >
                <Text style={s.cDescB}>{truncate(p.description, 38)}</Text>
                <Text style={s.cCatB}>
                  {p.categoryId ? truncate(categoryMap[p.categoryId] ?? "—", 18) : "—"}
                </Text>
                <Text style={s.cDateB}>{formatDateShort(p.purchaseDate)}</Text>
                <Text style={s.cInstB}>
                  {p.paidInstallments}/{p.totalInstallments}
                </Text>
                <Text style={s.cMonthB}>
                  {formatCents(p.amountPerInstallment, currency)}
                  {p.hasInterest ? " *" : ""}
                </Text>
                <Text style={s.cTotalB}>
                  {formatCents(p.totalWithInterest, currency)}
                </Text>
              </View>
            ))}

          {/* Pie de tabla con totales */}
          <View style={s.tableFoot}>
            <View style={{ flexDirection: "row", gap: 4 }}>
              <Text style={s.footLabel}>Cuota mensual total:</Text>
              <Text style={s.footValue}>{formatCents(totalActive, currency)}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 4 }}>
              <Text style={s.footLabel}>Deuda total:</Text>
              <Text style={[s.footValue, { color: C.danger }]}>
                {formatCents(card.currentBalance, currency)}
              </Text>
            </View>
          </View>

          {/* Nota si alguna compra tiene interés */}
          {purchases.some((p) => p.hasInterest) && (
            <Text style={{ fontSize: 7, color: C.muted, marginTop: 4 }}>
              * Las compras marcadas con asterisco incluyen interés compuesto mensual.
            </Text>
          )}
        </View>

        {/* ── Pie del documento ────────────────────────────────────────────── */}
        <View style={s.footer}>
          <Text style={s.footerText}>
            Okany Sync · {card.name} ···· {card.lastFourDigits} · {card.currency}
          </Text>
          <Text style={s.footerText}>
            {purchases.length} compra{purchases.length !== 1 ? "s" : ""} activa
            {purchases.length !== 1 ? "s" : ""} al {formatDateShort(now.getTime())}
          </Text>
        </View>

      </Page>
    </Document>
  );
}
