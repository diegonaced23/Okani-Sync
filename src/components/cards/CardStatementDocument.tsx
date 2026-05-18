// Documento PDF del extracto "A pagar" de tarjeta de crédito.
// Muestra las cuotas vencidas (si las hay) y las del ciclo actual,
// igual a lo que se ve en el tab "A pagar" de la tarjeta.
//
// Debe cargarse con dynamic import:
//   const { default: CardStatementDocument } = await import("@/components/cards/CardStatementDocument");

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { formatCents } from "@/lib/money";
import { formatDateShort } from "@/lib/utils";
import type { Doc } from "../../../convex/_generated/dataModel";

// ─── Paleta de colores ────────────────────────────────────────────────────────

const C = {
  ink:     "#1C1917",
  muted:   "#57534E",
  border:  "#E7E5E4",
  accent:  "#0D9488",
  danger:  "#DC2626",
  dangerBg:"#FEF2F2",
  surface: "#F5F5F4",
  white:   "#FFFFFF",
  header:  "#1C1917",
};

// ─── Estilos ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page:      { padding: 32, fontFamily: "Helvetica", fontSize: 9, color: C.ink },

  // Encabezado del doc
  appName:   { fontSize: 16, fontFamily: "Helvetica-Bold", color: C.accent },
  docTitle:  { fontSize: 10, color: C.muted, marginTop: 2 },
  cardBlock: {
    flexDirection: "row", justifyContent: "space-between",
    marginTop: 10, marginBottom: 14,
    paddingBottom: 10, borderBottomWidth: 0.5, borderBottomColor: C.border,
  },
  cardName:  { fontSize: 12, fontFamily: "Helvetica-Bold" },
  cardSub:   { fontSize: 8, color: C.muted, marginTop: 2 },
  cardRight: { alignItems: "flex-end", gap: 2 },
  cardBank:  { fontSize: 9, color: C.muted },
  cardDate:  { fontSize: 8, color: C.muted },

  // Resumen
  summaryRow:   { flexDirection: "row", gap: 8, marginBottom: 16 },
  summaryBox:   { flex: 1, padding: 8, borderRadius: 4, backgroundColor: C.surface, alignItems: "center" },
  summaryLabel: { fontSize: 6.5, color: C.muted, textTransform: "uppercase" },
  summaryValue: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 2 },
  summaryDate:  { fontSize: 7, color: C.muted, marginTop: 1 },

  // Alerta de vencidas
  overdueAlert: {
    flexDirection: "row", padding: "6 8", borderRadius: 4, marginBottom: 12,
    backgroundColor: C.dangerBg, borderWidth: 0.5, borderColor: C.danger,
  },
  overdueAlertText: { fontSize: 7.5, color: C.danger, fontFamily: "Helvetica-Bold" },

  // Cabecera de sección
  sectionHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 7, fontFamily: "Helvetica-Bold", color: C.muted,
    textTransform: "uppercase", letterSpacing: 0.8,
  },
  sectionTotal: { fontSize: 8, fontFamily: "Helvetica-Bold" },

  // Tabla de cuotas
  tableHeader: {
    flexDirection: "row", backgroundColor: C.header,
    padding: "4 8", borderRadius: "4 4 0 0",
  },
  tableHeaderDanger: { backgroundColor: C.danger },
  tableRow:    { flexDirection: "row", padding: "3.5 8", borderBottomWidth: 0.5, borderBottomColor: C.border },
  tableRowAlt: { backgroundColor: C.surface },
  tableRowDanger: { backgroundColor: C.dangerBg },

  // Columnas — header (blanco)
  cDesc:   { width: "34%", color: C.white },
  cCat:    { width: "16%", color: C.white },
  cInst:   { width: "10%", color: C.white, textAlign: "center" },
  cVence:  { width: "13%", color: C.white },
  cMonto:  { width: "14%", color: C.white, textAlign: "right" },
  cInt:    { width: "13%", color: C.white, textAlign: "right" },

  // Columnas — body
  cDescB:  { width: "34%" },
  cCatB:   { width: "16%", color: C.muted },
  cInstB:  { width: "10%", textAlign: "center" },
  cVenceB: { width: "13%", color: C.muted },
  cMontoB: { width: "14%", textAlign: "right", fontFamily: "Helvetica-Bold" },
  cIntB:   { width: "13%", textAlign: "right", color: C.muted },

  // Fila de subtotal
  subtotalRow: {
    flexDirection: "row", justifyContent: "flex-end", gap: 4,
    padding: "4 8", borderTopWidth: 1, borderTopColor: C.ink,
  },
  subtotalLabel: { fontSize: 7.5, color: C.muted },
  subtotalValue: { fontSize: 7.5, fontFamily: "Helvetica-Bold" },

  // Separador entre secciones
  divider: { marginTop: 14, marginBottom: 10 },

  // Pie
  footer: {
    marginTop: 16, paddingTop: 8,
    borderTopWidth: 0.5, borderTopColor: C.border,
    flexDirection: "row", justifyContent: "space-between",
  },
  footerText: { fontSize: 7, color: C.muted },
});

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface InstallmentEntry {
  installmentNumber: number;
  totalInstallments: number;
  amount: number;
  dueDate: number;
  interestAmount?: number;
  principalAmount?: number;
  description: string;
  category: string;
}

interface CardStatementProps {
  card: Doc<"cards">;
  cycle: {
    prevCutoffTs: number;
    nextCutoffTs: number;
    prevPaymentTs: number;
    nextPaymentTs: number;
  };
  overdue: InstallmentEntry[];       // cuotas vencidas sin pagar
  currentCycle: InstallmentEntry[];  // cuotas del ciclo actual
  minimumPayment: number;
  hasOverdue: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncate(str: string, n: number): string {
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

// Tabla de cuotas reutilizable para ambas secciones
function InstallmentTable({
  rows,
  currency,
  isOverdue,
}: {
  rows: InstallmentEntry[];
  currency: string;
  isOverdue: boolean;
}) {
  const total = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <View>
      {/* Cabecera */}
      <View style={[s.tableHeader, isOverdue ? s.tableHeaderDanger : {}]}>
        <Text style={s.cDesc}>Descripción</Text>
        <Text style={s.cCat}>Categoría</Text>
        <Text style={s.cInst}>Cuota</Text>
        <Text style={s.cVence}>Vence</Text>
        <Text style={s.cMonto}>Monto</Text>
        <Text style={s.cInt}>Interés</Text>
      </View>

      {/* Filas */}
      {rows.map((r, i) => (
        <View
          key={`${r.installmentNumber}-${i}`}
          style={[
            s.tableRow,
            isOverdue
              ? s.tableRowDanger
              : i % 2 === 1 ? s.tableRowAlt : {},
          ]}
        >
          <Text style={s.cDescB}>{truncate(r.description, 38)}</Text>
          <Text style={s.cCatB}>{truncate(r.category || "—", 18)}</Text>
          <Text style={s.cInstB}>
            {r.totalInstallments > 1
              ? `${r.installmentNumber}/${r.totalInstallments}`
              : "—"}
          </Text>
          <Text style={s.cVenceB}>{formatDateShort(r.dueDate)}</Text>
          <Text style={[s.cMontoB, isOverdue ? { color: C.danger } : {}]}>
            {formatCents(r.amount, currency)}
          </Text>
          <Text style={s.cIntB}>
            {r.interestAmount && r.interestAmount > 0
              ? formatCents(r.interestAmount, currency)
              : "—"}
          </Text>
        </View>
      ))}

      {/* Subtotal */}
      <View style={s.subtotalRow}>
        <Text style={s.subtotalLabel}>
          {isOverdue ? "Total vencido:" : "Total a pagar:"}
        </Text>
        <Text style={[s.subtotalValue, isOverdue ? { color: C.danger } : {}]}>
          {formatCents(total, currency)}
        </Text>
      </View>
    </View>
  );
}

// ─── Documento principal ──────────────────────────────────────────────────────

export default function CardStatementDocument({
  card,
  cycle,
  overdue,
  currentCycle,
  minimumPayment,
  hasOverdue,
}: CardStatementProps) {
  const currency   = card.currency;
  const now        = new Date();
  const paymentTs  = hasOverdue ? cycle.prevPaymentTs : cycle.nextPaymentTs;
  const overdueTotal = overdue.reduce((s, r) => s + r.amount, 0);
  const totalCuotas  = overdue.length + currentCycle.length;

  return (
    <Document
      title={`Extracto a pagar — ${card.name} ···· ${card.lastFourDigits}`}
      author="Okany Sync"
    >
      <Page size="A4" style={s.page}>

        {/* ── Encabezado ────────────────────────────────────────────────────── */}
        <Text style={s.appName}>Okany Sync</Text>
        <Text style={s.docTitle}>Extracto a pagar — tarjeta de crédito</Text>

        {/* ── Datos de la tarjeta ──────────────────────────────────────────── */}
        <View style={s.cardBlock}>
          <View>
            <Text style={s.cardName}>
              {card.name} ···· {card.lastFourDigits}
            </Text>
            <Text style={s.cardSub}>
              {card.bankName} · Corte día {card.cutoffDay} · Pago día {card.paymentDay}
            </Text>
          </View>
          <View style={s.cardRight}>
            <Text style={s.cardBank}>{currency}</Text>
            <Text style={s.cardDate}>
              Período: {formatDateShort(cycle.prevCutoffTs)} — {formatDateShort(cycle.nextCutoffTs)}
            </Text>
            <Text style={s.cardDate}>
              Generado el {formatDateShort(now.getTime())}
            </Text>
          </View>
        </View>

        {/* ── Alerta de pago vencido ───────────────────────────────────────── */}
        {hasOverdue && (
          <View style={s.overdueAlert}>
            <Text style={s.overdueAlertText}>
              ⚠  Tiene cuotas de ciclos anteriores sin pagar.
              Fecha de vencimiento: {formatDateShort(cycle.prevPaymentTs)}.
            </Text>
          </View>
        )}

        {/* ── Resumen: 3 cajas ─────────────────────────────────────────────── */}
        <View style={s.summaryRow}>
          <View style={s.summaryBox}>
            <Text style={s.summaryLabel}>
              {hasOverdue ? "Pago mínimo (vencido)" : "Pago mínimo"}
            </Text>
            <Text style={[s.summaryValue, { color: hasOverdue ? C.danger : C.ink }]}>
              {formatCents(minimumPayment, currency)}
            </Text>
            <Text style={s.summaryDate}>Vence: {formatDateShort(paymentTs)}</Text>
          </View>
          {hasOverdue && (
            <View style={s.summaryBox}>
              <Text style={s.summaryLabel}>Total vencido</Text>
              <Text style={[s.summaryValue, { color: C.danger }]}>
                {formatCents(overdueTotal, currency)}
              </Text>
              <Text style={s.summaryDate}>{overdue.length} cuota{overdue.length !== 1 ? "s" : ""}</Text>
            </View>
          )}
          <View style={s.summaryBox}>
            <Text style={s.summaryLabel}>Cuotas en este extracto</Text>
            <Text style={[s.summaryValue, { color: C.ink }]}>{totalCuotas}</Text>
          </View>
          <View style={s.summaryBox}>
            <Text style={s.summaryLabel}>Saldo pendiente</Text>
            <Text style={[s.summaryValue, { color: C.danger }]}>
              {formatCents(card.currentBalance, currency)}
            </Text>
          </View>
        </View>

        {/* ── Cuotas vencidas ──────────────────────────────────────────────── */}
        {overdue.length > 0 && (
          <View>
            <View style={s.sectionHeader}>
              <Text style={[s.sectionTitle, { color: C.danger }]}>
                Cuotas vencidas ({overdue.length})
              </Text>
            </View>
            <InstallmentTable rows={overdue} currency={currency} isOverdue={true} />
          </View>
        )}

        {/* Separador visual entre secciones */}
        {overdue.length > 0 && currentCycle.length > 0 && (
          <View style={s.divider} />
        )}

        {/* ── Cuotas del ciclo actual ──────────────────────────────────────── */}
        {currentCycle.length > 0 && (
          <View>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>
                Ciclo actual ({currentCycle.length} cuota{currentCycle.length !== 1 ? "s" : ""})
              </Text>
              <Text style={s.sectionTitle}>
                Vence: {formatDateShort(cycle.nextPaymentTs)}
              </Text>
            </View>
            <InstallmentTable rows={currentCycle} currency={currency} isOverdue={false} />
          </View>
        )}

        {/* Estado vacío si no hay nada que pagar */}
        {overdue.length === 0 && currentCycle.length === 0 && (
          <Text style={{ color: C.muted, fontSize: 10, textAlign: "center", marginTop: 20 }}>
            No hay cuotas pendientes en este período.
          </Text>
        )}

        {/* ── Pie del documento ────────────────────────────────────────────── */}
        <View style={s.footer}>
          <Text style={s.footerText}>
            Okany Sync · {card.name} ···· {card.lastFourDigits}
          </Text>
          <Text style={s.footerText}>
            {totalCuotas} cuota{totalCuotas !== 1 ? "s" : ""} · Período {formatDateShort(cycle.prevCutoffTs)} — {formatDateShort(cycle.nextCutoffTs)}
          </Text>
        </View>

      </Page>
    </Document>
  );
}
