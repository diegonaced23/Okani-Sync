import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Esquema de base de datos para Okany Sync
 * PWA de gestión de finanzas personales — es-CO
 *
 * Convenciones:
 * - Todos los timestamps se almacenan como números (Date.now())
 * - userId / ownerId siempre referencia al clerkId del usuario autenticado
 * - El campo `month` se guarda como "YYYY-MM" para indexar consultas mensuales
 * - MONTOS: enteros escalados ×100 (ej. 1.500,50 COP → 150050).
 *   Usar toCents() / fromCents() en lib/money.ts. Evita errores de punto flotante.
 * - Multi-moneda: cada cuenta/tarjeta tiene su propia moneda. La consolidación
 *   se hace contra la moneda preferida del usuario (default COP) usando exchangeRates.
 * - Cuentas compartidas: una cuenta tiene un `ownerId` y opcionalmente registros en
 *   `accountShares` que definen permisos para otros usuarios.
 * - Transferencias: modelo de doble entrada. Una transferencia genera 2 transactions
 *   enlazadas por el mismo `transferGroupId` (UUID string).
 */
export default defineSchema({
  // ============================================================
  // USUARIOS — Sincronizados desde Clerk vía webhook
  // ============================================================
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    imageUrl: v.optional(v.string()),
    role: v.union(v.literal("admin"), v.literal("user")),
    active: v.boolean(),
    locale: v.string(),       // default "es-CO"
    currency: v.string(),     // moneda preferida para consolidar, default "COP"
    theme: v.optional(
      v.union(v.literal("light"), v.literal("dark"), v.literal("system"))
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    createdBy: v.optional(v.string()),       // clerkId del admin que lo creó
    welcomeEmailSentAt: v.optional(v.number()),
  })
    .index("by_clerkId", ["clerkId"])
    .index("by_email", ["email"])
    .index("by_role", ["role"]),

  // ============================================================
  // SUSCRIPCIONES WEB PUSH — Multi-dispositivo por usuario
  // Una sub caducada (410 Gone) se elimina individualmente.
  // ============================================================
  pushSubscriptions: defineTable({
    userId: v.string(),          // clerkId del usuario
    endpoint: v.string(),
    keys: v.object({
      p256dh: v.string(),
      auth: v.string(),
    }),
    userAgent: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_endpoint", ["endpoint"]),

  // ============================================================
  // CUENTAS — Bancarias, ahorros, billetera (efectivo)
  // ============================================================
  accounts: defineTable({
    ownerId: v.string(),
    name: v.string(),
    type: v.union(
      v.literal("billetera"),
      v.literal("bancaria"),
      v.literal("ahorros"),
      v.literal("inversion")
    ),
    bankName: v.optional(v.string()),
    accountNumber: v.optional(v.string()),
    balance: v.number(),         // en centavos (×100) en la moneda de la cuenta
    initialBalance: v.number(),  // saldo de apertura para conciliación
    currency: v.string(),
    color: v.string(),
    icon: v.string(),
    isDefault: v.boolean(),
    isShared: v.boolean(),
    archived: v.boolean(),
    notes: v.optional(v.string()),
    displayOrder: v.optional(v.number()),
    includeInBalance: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_archived", ["ownerId", "archived"])
    .index("by_owner_type", ["ownerId", "type"]),

  // ============================================================
  // COMPARTIR CUENTAS — Permisos por cuenta para otros usuarios
  // ============================================================
  accountShares: defineTable({
    accountId: v.id("accounts"),
    ownerId: v.string(),
    sharedWithUserId: v.string(),
    permission: v.union(
      v.literal("viewer"),
      v.literal("editor"),
      v.literal("admin")
    ),
    status: v.union(
      v.literal("pendiente"),
      v.literal("aceptada"),
      v.literal("rechazada"),
      v.literal("revocada")
    ),
    invitedAt: v.number(),
    respondedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_account", ["accountId"])
    .index("by_shared_user", ["sharedWithUserId"])
    .index("by_owner", ["ownerId"])
    .index("by_shared_user_status", ["sharedWithUserId", "status"]),

  // ============================================================
  // TASAS DE CAMBIO — Histórico para reportes precisos por fecha
  // ============================================================
  exchangeRates: defineTable({
    fromCurrency: v.string(),
    toCurrency: v.string(),
    rate: v.number(),
    source: v.union(v.literal("manual"), v.literal("api")),
    effectiveDate: v.number(),
    createdAt: v.number(),
    createdBy: v.optional(v.string()),
  })
    .index("by_pair", ["fromCurrency", "toCurrency"])
    .index("by_pair_date", ["fromCurrency", "toCurrency", "effectiveDate"]),

  // ============================================================
  // TASAS ACTUALES — Lookup O(1) para el dashboard (1 fila por par)
  // Se actualiza en el mismo job que inserta el histórico.
  // ============================================================
  currentExchangeRates: defineTable({
    fromCurrency: v.string(),
    toCurrency: v.string(),
    rate: v.number(),
    updatedAt: v.number(),
  })
    .index("by_pair", ["fromCurrency", "toCurrency"]),

  // ============================================================
  // TARJETAS DE CRÉDITO — Personales, no se comparten
  // ============================================================
  cards: defineTable({
    userId: v.string(),
    name: v.string(),
    bankName: v.string(),
    lastFourDigits: v.string(),
    brand: v.optional(
      v.union(
        v.literal("visa"),
        v.literal("mastercard"),
        v.literal("amex"),
        v.literal("diners"),
        v.literal("otro")
      )
    ),
    creditLimit: v.number(),       // en centavos
    currentBalance: v.number(),    // deuda actual en centavos
    availableCredit: v.number(),   // creditLimit - currentBalance
    cutoffDay: v.number(),
    paymentDay: v.number(),
    interestRate: v.optional(v.number()), // tasa mensual decimal (0.025 = 2.5%)
    minimumPayment: v.optional(v.number()),
    currency: v.string(),
    color: v.string(),
    icon: v.string(),
    archived: v.boolean(),
    notes: v.optional(v.string()),
    displayOrder: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_archived", ["userId", "archived"]),

  // ============================================================
  // COMPRAS A CUOTAS DE TARJETA
  // M = P × (i × (1+i)^n) / ((1+i)^n − 1)
  // ============================================================
  cardPurchases: defineTable({
    userId: v.string(),
    cardId: v.id("cards"),
    categoryId: v.optional(v.id("categories")),
    description: v.string(),
    totalAmount: v.number(),           // monto base en centavos
    totalWithInterest: v.number(),     // monto total a pagar en centavos
    totalInstallments: v.number(),
    paidInstallments: v.number(),
    amountPerInstallment: v.number(),  // cuota mensual en centavos
    hasInterest: v.boolean(),
    interestRate: v.optional(v.number()),
    totalInterest: v.optional(v.number()),
    currency: v.string(),
    purchaseDate: v.number(),
    firstInstallmentDate: v.number(),
    status: v.union(
      v.literal("activa"),
      v.literal("pagada"),
      v.literal("cancelada")
    ),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_card", ["cardId"])
    .index("by_user_status", ["userId", "status"]),

  // ============================================================
  // CUOTAS INDIVIDUALES — Cronograma con desglose capital/interés
  // ============================================================
  cardInstallments: defineTable({
    userId: v.string(),
    purchaseId: v.id("cardPurchases"),
    cardId: v.id("cards"),
    installmentNumber: v.number(),
    amount: v.number(),                   // cuota total en centavos
    principalAmount: v.optional(v.number()),
    interestAmount: v.optional(v.number()),
    remainingPrincipal: v.optional(v.number()),
    dueDate: v.number(),
    month: v.string(),
    paid: v.boolean(),
    paidAt: v.optional(v.number()),
    transactionId: v.optional(v.id("transactions")),
    createdAt: v.number(),
  })
    .index("by_purchase", ["purchaseId"])
    .index("by_user_month", ["userId", "month"])
    .index("by_card_month", ["cardId", "month"])
    .index("by_user_paid", ["userId", "paid"]),

  // ============================================================
  // DEUDAS — Préstamos, hipotecas, deudas personales
  // ============================================================
  debts: defineTable({
    userId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    creditor: v.string(),
    type: v.union(
      v.literal("prestamo"),
      v.literal("personal"),
      v.literal("hipoteca"),
      v.literal("vehiculo"),
      v.literal("otro")
    ),
    originalAmount: v.number(),    // en centavos
    currentBalance: v.number(),    // saldo pendiente en centavos
    interestRate: v.optional(v.number()),
    monthlyPayment: v.optional(v.number()),
    startDate: v.number(),
    dueDate: v.optional(v.number()),
    status: v.union(
      v.literal("activa"),
      v.literal("pagada"),
      v.literal("vencida")
    ),
    currency: v.string(),
    color: v.string(),
    icon: v.string(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_status_dueDate", ["status", "dueDate"]),

  // ============================================================
  // PAGOS A DEUDAS — Histórico de abonos
  // ============================================================
  debtPayments: defineTable({
    userId: v.string(),
    debtId: v.id("debts"),
    amount: v.number(),       // en centavos
    currency: v.string(),
    date: v.number(),
    month: v.string(),
    transactionId: v.optional(v.id("transactions")),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_debt", ["debtId"])
    .index("by_user_month", ["userId", "month"]),

  // ============================================================
  // CATEGORÍAS — Para clasificar ingresos y gastos
  // ============================================================
  categories: defineTable({
    userId: v.string(),
    name: v.string(),
    type: v.union(
      v.literal("ingreso"),
      v.literal("gasto"),
      v.literal("ambos")
    ),
    color: v.string(),
    icon: v.string(),
    parentId: v.optional(v.id("categories")),
    isDefault: v.boolean(),
    archived: v.boolean(),
    order: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_type", ["userId", "type"])
    .index("by_user_archived", ["userId", "archived"]),

  // ============================================================
  // PRESUPUESTOS — Por categoría y mes
  // ============================================================
  budgets: defineTable({
    userId: v.string(),
    categoryId: v.id("categories"),
    amount: v.number(),        // presupuestado en centavos (moneda preferida)
    spent: v.number(),         // gastado en centavos (se recalcula con cada tx)
    currency: v.string(),
    month: v.string(),
    notes: v.optional(v.string()),
    alertThreshold: v.optional(v.number()), // % para notificar (default 80)
    notifiedAt: v.optional(v.number()),
    recurring: v.optional(v.boolean()),     // se copia al mes siguiente automáticamente
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_month", ["userId", "month"])
    .index("by_user_category_month", ["userId", "categoryId", "month"]),

  // ============================================================
  // TRANSACCIONES — Ingresos, gastos, transferencias
  //
  // TRANSFERENCIAS — Modelo de doble entrada:
  //   - Transacción de salida: type "gasto", accountId = cuenta origen
  //   - Transacción de entrada: type "ingreso", accountId = cuenta destino
  //   - Ambas comparten el mismo transferGroupId (UUID generado en la mutation)
  //   - toAccountId se mantiene en la tx de salida para referencia rápida
  //
  // En cuentas compartidas: userId = quien registró la transacción
  // ============================================================
  transactions: defineTable({
    userId: v.string(),
    type: v.union(
      v.literal("ingreso"),
      v.literal("gasto"),
      v.literal("transferencia"),   // mantener para backward compat / display
      v.literal("pago_tarjeta"),
      v.literal("pago_deuda"),
      v.literal("ajuste")            // reasignación manual de saldo
    ),
    amount: v.number(),             // en centavos
    description: v.string(),
    date: v.number(),
    month: v.string(),
    currency: v.string(),

    accountId: v.optional(v.id("accounts")),
    cardId: v.optional(v.id("cards")),

    // Para transferencias (modelo doble entrada)
    toAccountId: v.optional(v.id("accounts")),   // en tx de salida, para referencia
    transferGroupId: v.optional(v.string()),       // UUID que enlaza las dos tx

    // Para transferencias multi-moneda
    exchangeRate: v.optional(v.number()),
    toAmount: v.optional(v.number()),             // en centavos, moneda destino
    toCurrency: v.optional(v.string()),

    categoryId: v.optional(v.id("categories")),

    cardPurchaseId: v.optional(v.id("cardPurchases")),
    cardInstallmentId: v.optional(v.id("cardInstallments")),
    debtId: v.optional(v.id("debts")),

    receiptStorageId: v.optional(v.id("_storage")),
    receiptUrl: v.optional(v.string()),

    status: v.union(
      v.literal("completada"),
      v.literal("pendiente"),
      v.literal("cancelada")
    ),

    isRecurring: v.boolean(),
    recurringId: v.optional(v.id("recurringTransactions")),

    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_month", ["userId", "month"])
    .index("by_user_date", ["userId", "date"])
    .index("by_account", ["accountId"])
    .index("by_account_month", ["accountId", "month"])
    .index("by_card", ["cardId"])
    .index("by_user_type_month", ["userId", "type", "month"])
    .index("by_user_category_month", ["userId", "categoryId", "month"])
    .index("by_transfer_group", ["transferGroupId"]),

  // ============================================================
  // TRANSACCIONES RECURRENTES — Plantillas para auto-generar
  // Incluye tipos de pago para domiciliar cuotas/deudas.
  // ============================================================
  recurringTransactions: defineTable({
    userId: v.string(),
    type: v.union(
      v.literal("ingreso"),
      v.literal("gasto"),
      v.literal("pago_tarjeta"),
      v.literal("pago_deuda")
    ),
    amount: v.number(),           // en centavos
    description: v.string(),
    accountId: v.optional(v.id("accounts")),
    cardId: v.optional(v.id("cards")),
    categoryId: v.optional(v.id("categories")),
    targetCardId: v.optional(v.id("cards")),    // tarjeta destino para pago_tarjeta
    targetDebtId: v.optional(v.id("debts")),    // deuda destino para pago_deuda
    frequency: v.union(
      v.literal("diaria"),
      v.literal("semanal"),
      v.literal("quincenal"),
      v.literal("mensual"),
      v.literal("anual")
    ),
    dayOfMonth: v.optional(v.number()),
    startDate: v.number(),
    endDate: v.optional(v.number()),
    nextOccurrence: v.number(),
    active: v.boolean(),
    currency: v.string(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_active", ["userId", "active"])
    .index("by_next_occurrence", ["nextOccurrence"]),

  // ============================================================
  // SESIONES — Log para "Cerrar sesiones activas" en Perfil
  // Las sesiones reales las maneja Clerk; aquí guardamos el registro.
  // ============================================================
  sessions: defineTable({
    userId: v.string(),
    clerkSessionId: v.string(),
    device: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
    location: v.optional(v.string()),
    lastActiveAt: v.number(),
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_clerk_session", ["clerkSessionId"]),

  // ============================================================
  // INVITACIONES — Control de acceso: solo usuarios invitados por un admin
  // El webhook user.created verifica esta tabla antes de crear el usuario en Convex.
  // ============================================================
  invitations: defineTable({
    email: v.string(),
    role: v.union(v.literal("user"), v.literal("admin")),
    status: v.union(v.literal("pending"), v.literal("accepted")),
    invitedBy: v.string(),          // clerkId del admin que invitó
    createdAt: v.number(),
    acceptedAt: v.optional(v.number()),
  })
    .index("by_email", ["email"])
    .index("by_status", ["status"]),

  // ============================================================
  // LOG DE AUDITORÍA — Acciones administrativas y cambios sensibles
  // Usar constante AUDIT_ACTIONS de lib/constants.ts para los valores de action.
  // ============================================================
  auditLogs: defineTable({
    userId: v.string(),                          // quién hizo la acción
    targetUserId: v.optional(v.string()),        // sobre quién se hizo
    action: v.string(),                          // ver AUDIT_ACTIONS
    entity: v.optional(v.string()),
    entityId: v.optional(v.string()),
    metadata: v.optional(v.any()),
    ipAddress: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_action", ["action"])
    .index("by_target", ["targetUserId"]),

  // ============================================================
  // NOTIFICACIONES — Alertas in-app + Web Push
  // ============================================================
  notifications: defineTable({
    userId: v.string(),
    type: v.union(
      v.literal("presupuesto_alerta"),
      v.literal("presupuesto_excedido"),
      v.literal("cuota_proxima"),
      v.literal("deuda_vencida"),
      v.literal("deuda_proxima"),
      v.literal("recordatorio_registro"),
      v.literal("transaccion_recurrente"),
      v.literal("resumen_semanal"),
      v.literal("resumen_mensual"),
      v.literal("pago_tarjeta_proximo"),
      v.literal("cuenta_compartida"),
      v.literal("share_aceptado"),
      v.literal("sistema")
    ),
    title: v.string(),
    message: v.string(),
    read: v.boolean(),
    pushSent: v.boolean(),
    actionUrl: v.optional(v.string()),
    relatedEntityId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_read", ["userId", "read"])
    .index("by_user_push_sent", ["userId", "pushSent"]),
});
