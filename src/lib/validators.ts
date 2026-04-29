import { z } from "zod";

// ─── Transacciones ────────────────────────────────────────────────────────────

export const transactionSchema = z.object({
  type: z.enum(["ingreso", "gasto", "transferencia", "pago_tarjeta", "pago_deuda"]),
  amount: z.number().positive("El monto debe ser mayor que cero"),
  description: z.string().min(1, "La descripción es obligatoria").max(200),
  date: z.number().positive(),
  currency: z.string().min(3).max(3),
  accountId: z.string().optional(),
  cardId: z.string().optional(),
  toAccountId: z.string().optional(),
  exchangeRate: z.number().positive().optional(),
  categoryId: z.string().optional(),
  notes: z.string().max(500).optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
});

export type TransactionInput = z.infer<typeof transactionSchema>;

// ─── Cuentas ─────────────────────────────────────────────────────────────────

export const accountSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio").max(60),
  type: z.enum(["billetera", "bancaria", "ahorros", "inversion"]),
  bankName: z.string().max(60).optional(),
  accountNumber: z.string().max(20).optional(),
  initialBalance: z.number().min(0, "El saldo inicial no puede ser negativo"),
  currency: z.string().min(3).max(3),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Color hex inválido"),
  icon: z.string().min(1),
  notes: z.string().max(300).optional(),
});

export type AccountInput = z.infer<typeof accountSchema>;

// ─── Tarjetas ─────────────────────────────────────────────────────────────────

export const cardSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio").max(60),
  bankName: z.string().min(1, "El banco es obligatorio").max(60),
  lastFourDigits: z.string().length(4, "Deben ser exactamente 4 dígitos").regex(/^\d{4}$/),
  brand: z.enum(["visa", "mastercard", "amex", "diners", "otro"]).optional(),
  creditLimit: z.number().positive("El cupo debe ser mayor que cero"),
  cutoffDay: z.number().int().min(1).max(31),
  paymentDay: z.number().int().min(1).max(31),
  interestRate: z.number().min(0).max(1).optional(),
  currency: z.string().min(3).max(3),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Color hex inválido"),
  icon: z.string().min(1),
  notes: z.string().max(300).optional(),
});

export type CardInput = z.infer<typeof cardSchema>;

// ─── Compra a cuotas ──────────────────────────────────────────────────────────

export const cardPurchaseSchema = z.object({
  cardId: z.string().min(1),
  categoryId: z.string().optional(),
  description: z.string().min(1, "La descripción es obligatoria").max(200),
  totalAmount: z.number().positive("El monto debe ser mayor que cero"),
  totalInstallments: z.number().int().min(1).max(60),
  hasInterest: z.boolean(),
  interestRate: z.number().min(0).max(1).optional(),
  purchaseDate: z.number().positive(),
  notes: z.string().max(300).optional(),
}).refine(
  (data) => !data.hasInterest || data.interestRate !== undefined,
  { message: "La tasa de interés es obligatoria si la compra genera intereses", path: ["interestRate"] }
);

export type CardPurchaseInput = z.infer<typeof cardPurchaseSchema>;

// ─── Deudas ───────────────────────────────────────────────────────────────────

export const debtSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio").max(60),
  description: z.string().max(300).optional(),
  creditor: z.string().min(1, "El acreedor es obligatorio").max(100),
  type: z.enum(["prestamo", "personal", "hipoteca", "vehiculo", "otro"]),
  originalAmount: z.number().positive("El monto original debe ser mayor que cero"),
  interestRate: z.number().min(0).max(1).optional(),
  monthlyPayment: z.number().positive().optional(),
  startDate: z.number().positive(),
  dueDate: z.number().positive().optional(),
  currency: z.string().min(3).max(3),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Color hex inválido"),
  icon: z.string().min(1),
  notes: z.string().max(300).optional(),
});

export type DebtInput = z.infer<typeof debtSchema>;

// ─── Presupuestos ─────────────────────────────────────────────────────────────

export const budgetSchema = z.object({
  categoryId: z.string().min(1, "La categoría es obligatoria"),
  amount: z.number().positive("El presupuesto debe ser mayor que cero"),
  currency: z.string().min(3).max(3),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Formato de mes inválido (YYYY-MM)"),
  notes: z.string().max(200).optional(),
  alertThreshold: z.number().min(1).max(100).optional(),
});

export type BudgetInput = z.infer<typeof budgetSchema>;

// ─── Categorías ───────────────────────────────────────────────────────────────

export const categorySchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio").max(60),
  type: z.enum(["ingreso", "gasto", "ambos"]),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Color hex inválido"),
  icon: z.string().min(1),
  parentId: z.string().optional(),
  notes: z.string().max(200).optional(),
});

export type CategoryInput = z.infer<typeof categorySchema>;

// ─── Compartir cuenta ─────────────────────────────────────────────────────────

export const shareAccountSchema = z.object({
  accountId: z.string().min(1),
  email: z.string().email("Correo electrónico inválido"),
  permission: z.enum(["viewer", "editor", "admin"]),
});

export type ShareAccountInput = z.infer<typeof shareAccountSchema>;

// ─── Crear usuario (admin) ────────────────────────────────────────────────────

export const createUserSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres").max(80),
  email: z.string().email("Correo electrónico inválido"),
  role: z.enum(["user", "admin"]),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
