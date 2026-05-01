// Constantes globales de Okany Sync

// ─── Monedas soportadas ───────────────────────────────────────────────────────

export const CURRENCIES = [
  { code: "COP", name: "Peso Colombiano", symbol: "$" },
  { code: "USD", name: "Dólar Estadounidense", symbol: "US$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "MXN", name: "Peso Mexicano", symbol: "MX$" },
  { code: "GBP", name: "Libra Esterlina", symbol: "£" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

export const DEFAULT_CURRENCY: CurrencyCode = "COP";

// Pares de tasas de cambio que el cron actualiza diariamente
export const EXCHANGE_RATE_PAIRS = [
  { from: "USD", to: "COP" },
  { from: "EUR", to: "COP" },
  { from: "MXN", to: "COP" },
  { from: "GBP", to: "COP" },
  { from: "COP", to: "USD" },
  { from: "COP", to: "EUR" },
] as const;

// ─── Categorías por defecto ───────────────────────────────────────────────────

export interface DefaultCategory {
  name: string;
  type: "ingreso" | "gasto";
  color: string;
  icon: string;
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  // Gastos
  { name: "Alimentación", type: "gasto", color: "#F59E0B", icon: "utensils" },
  { name: "Transporte", type: "gasto", color: "#3B82F6", icon: "car" },
  { name: "Vivienda", type: "gasto", color: "#8B5CF6", icon: "home" },
  { name: "Servicios", type: "gasto", color: "#06B6D4", icon: "zap" },
  { name: "Salud", type: "gasto", color: "#EF4444", icon: "heart-pulse" },
  { name: "Entretenimiento", type: "gasto", color: "#EC4899", icon: "music" },
  { name: "Educación", type: "gasto", color: "#10B981", icon: "book-open" },
  { name: "Ropa", type: "gasto", color: "#F97316", icon: "shirt" },
  { name: "Otros gastos", type: "gasto", color: "#6B7280", icon: "circle-ellipsis" },
  // Ingresos
  { name: "Salario", type: "ingreso", color: "#4ADE80", icon: "briefcase" },
  { name: "Freelance", type: "ingreso", color: "#34D399", icon: "laptop" },
  { name: "Inversiones", type: "ingreso", color: "#A78BFA", icon: "trending-up" },
  { name: "Regalos", type: "ingreso", color: "#FCD34D", icon: "gift" },
  { name: "Otros ingresos", type: "ingreso", color: "#6B7280", icon: "circle-ellipsis" },
];

// ─── Colores de categorías / deudas (sólidos) ────────────────────────────────

export const ACCOUNT_COLORS = [
  "#4ade80",  // lima
  "#22d3ee",  // cyan
  "#f97316",  // naranja
  "#8b5cf6",  // violeta
  "#ef4444",  // rojo
  "#fbbf24",  // amarillo
  "#a78bfa",  // violeta-2
  "#34d399",  // esmeralda
  "#fb923c",  // naranja-2
  "#38bdf8",  // cielo
  "#f472b6",  // rosa
  "#a3e635",  // lima brillante
];

// ─── Gradientes de cuentas / tarjetas de crédito ─────────────────────────────

export const ACCOUNT_GRADIENTS = [
  {
    key: "g-night",
    label: "Noche",
    gradient: "linear-gradient(135deg, oklch(0.30 0.04 270), oklch(0.18 0.05 260))",
    darkText: false,
    preview: "#1b2538",
  },
  {
    key: "g-red",
    label: "Rojo",
    gradient: "linear-gradient(135deg, oklch(0.55 0.22 27), oklch(0.32 0.14 20))",
    darkText: false,
    preview: "#9e2219",
  },
  {
    key: "g-ember",
    label: "Fuego",
    gradient: "linear-gradient(135deg, oklch(0.76 0.18 55), oklch(0.55 0.22 27))",
    darkText: false,
    preview: "#c84b10",
  },
  {
    key: "g-lime",
    label: "Lima",
    gradient: "linear-gradient(135deg, oklch(0.78 0.19 142), oklch(0.78 0.14 215))",
    darkText: true,
    preview: "#4ade80",
  },
  {
    key: "g-ocean",
    label: "Océano",
    gradient: "linear-gradient(135deg, oklch(0.78 0.14 215), oklch(0.65 0.22 295))",
    darkText: false,
    preview: "#0ea5e9",
  },
  {
    key: "g-violet",
    label: "Violeta",
    gradient: "linear-gradient(135deg, oklch(0.65 0.22 295), oklch(0.30 0.04 270))",
    darkText: false,
    preview: "#7c3aed",
  },
  {
    key: "g-rose",
    label: "Rosa",
    gradient: "linear-gradient(135deg, oklch(0.65 0.22 340), oklch(0.50 0.18 295))",
    darkText: false,
    preview: "#e11d48",
  },
  {
    key: "g-gold",
    label: "Oro",
    gradient: "linear-gradient(135deg, oklch(0.88 0.17 95), oklch(0.76 0.18 55))",
    darkText: true,
    preview: "#eab308",
  },
] as const;

export type GradientKey = (typeof ACCOUNT_GRADIENTS)[number]["key"];

export const GRADIENT_MAP = Object.fromEntries(
  ACCOUNT_GRADIENTS.map((g) => [g.key, g])
) as Record<string, typeof ACCOUNT_GRADIENTS[number]>;

// ─── Audit log — acciones registradas ────────────────────────────────────────

export const AUDIT_ACTIONS = {
  // Usuarios
  USER_CREATED: "user.created",
  USER_UPDATED: "user.updated",
  USER_DELETED: "user.deleted",
  USER_DEACTIVATED: "user.deactivated",
  USER_ROLE_CHANGED: "user.role.changed",
  // Cuentas
  ACCOUNT_CREATED: "account.created",
  ACCOUNT_DELETED: "account.deleted",
  ACCOUNT_SHARED: "account.shared",
  ACCOUNT_SHARE_REVOKED: "account.share.revoked",
  ACCOUNT_SHARE_ACCEPTED: "account.share.accepted",
  ACCOUNT_SHARE_REJECTED: "account.share.rejected",
  // Tarjetas
  CARD_CREATED: "card.created",
  CARD_DELETED: "card.deleted",
  // Admin
  ADMIN_EXPORT: "admin.export",
  USER_PASSWORD_RESET: "user.password_reset",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

// ─── Configuración de presupuestos ───────────────────────────────────────────

export const DEFAULT_ALERT_THRESHOLD = 80; // % de uso que dispara la alerta

// ─── Límite de archivos adjuntos ─────────────────────────────────────────────

export const MAX_RECEIPT_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

// ─── Paleta del tema ─────────────────────────────────────────────────────────

export const THEME = {
  dark: {
    background: "#1F262A",
    surface: "#343434",
    surfaceElevated: "#2A3236",
    border: "#3D4448",
    textPrimary: "#F5F5F5",
    textSecondary: "#A3A8AB",
    accent: "#4ADE80",
    danger: "#EF4444",
    warning: "#F59E0B",
    info: "#38BDF8",
  },
  light: {
    background: "#FAFAF9",
    surface: "#FFFFFF",
    surfaceElevated: "#F5F5F4",
    border: "#E7E5E4",
    textPrimary: "#1C1917",
    textSecondary: "#57534E",
    accent: "#16A34A",
    danger: "#DC2626",
    warning: "#D97706",
    info: "#0284C7",
  },
} as const;

// ─── Íconos disponibles para cuentas / deudas ────────────────────────────────

export const ACCOUNT_ICONS = [
  "wallet", "piggy-bank", "landmark", "credit-card",
  "banknote", "coins", "bar-chart-2", "briefcase",
] as const;

export const DEBT_ICONS = [
  "hand-coins", "building-2", "car", "home",
  "graduation-cap", "credit-card", "circle-ellipsis",
] as const;
