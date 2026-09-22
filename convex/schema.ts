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
  // USUARIOS — Creados vía invitación (users.ensureExists / invitations.ts)
  // o por un admin (users.createFromAdmin); ya no hay webhook externo.
  // ============================================================
  users: defineTable({
    clerkId: v.string(),
    // Id del usuario en Better Auth (identity.subject) — puente de migración
    // desde Clerk, ver docs/migracion-better-auth.md. El campo `clerkId` NO se
    // toca: sigue siendo el identificador histórico que usan todas las demás
    // tablas (accounts, transactions, etc). `authId` solo vincula la sesión
    // actual con esta fila; se completa la primera vez que cada usuario se
    // autentica bajo Better Auth (trigger `onCreate` en convex/auth.ts, con
    // `ensureExists` en convex/users.ts como respaldo idempotente).
    authId: v.optional(v.string()),
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
    // Preferencias de notificación por familia. Opcional a propósito:
    // `undefined` significa "todo activo", así que ningún usuario existente
    // pierde notificaciones al desplegar el campo. El mapeo tipo → familia
    // vive en src/lib/notifications.ts y lo aplica convex/lib/notify.ts.
    notificationPrefs: v.optional(
      v.object({
        presupuestos: v.boolean(),
        tarjetas: v.boolean(),
        deudasPrestamos: v.boolean(),
        recurrentes: v.boolean(),
        recordatorioDiario: v.boolean(),
        resumenes: v.boolean(),
      })
    ),
    // Avatar subido por el usuario. `imageUrl` (arriba) es el campo heredado de
    // Clerk: se sigue leyendo como respaldo pero ya no se escribe nunca.
    imageStorageId: v.optional(v.id("_storage")),
    // Estrangulador de subidas de avatar (ver users.generateAvatarUploadUrl).
    lastAvatarUploadAt: v.optional(v.number()),
    // Cuenta o tarjeta que llega seleccionada al registrar un movimiento. Una
    // sola para todo: si es una tarjeta, en un ingreso no aplica (una tarjeta no
    // recibe ingresos). Si se archiva o se borra, el formulario la ignora.
    favoriteSource: v.optional(
      v.union(
        v.object({ kind: v.literal("account"), id: v.id("accounts") }),
        v.object({ kind: v.literal("card"), id: v.id("cards") })
      )
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    createdBy: v.optional(v.string()),       // clerkId del admin que lo creó
    welcomeEmailSentAt: v.optional(v.number()),
    // Corte a Better Auth (Fase 4, docs/migracion-better-auth.md): marca que
    // ya se le mandó el magic link de "define tu acceso nuevo". Permite que
    // sendMigrationMagicLinks sea reanudable sin volver a mandarle el correo
    // a quien ya lo recibió.
    authMigrationEmailSentAt: v.optional(v.number()),
    // Última vez que el usuario cargó la app estando autenticado. Lo escribe
    // ensureExists con acelerador de una hora (ver src/lib/adminHealth.ts).
    // `undefined` = nunca ha entrado desde que existe el campo; la interfaz lo
    // dice así en vez de inventarse una fecha.
    lastSeenAt: v.optional(v.number()),
  })
    .index("by_clerkId", ["clerkId"])
    .index("by_authId", ["authId"])
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
    // Tarjeta débito: es el plástico de esta misma cuenta (mismo saldo), solo dato visible.
    // Solo aplica a "bancaria" (día a día) y "ahorros".
    hasDebitCard: v.optional(v.boolean()),
    debitCardLast4: v.optional(v.string()),
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
    // Excluir del patrimonio neto. Optativo a propósito: las filas que ya existen
    // no lo traen y se leen como incluidas (`!== false`), igual que en `accounts`.
    includeInBalance: v.optional(v.boolean()),
    // Cuenta de cobro: la que sale preseleccionada al pagar (y la que usará el pago
    // automático). Optativa: las tarjetas existentes no la traen.
    billingAccountId: v.optional(v.id("accounts")),
    // Categoría donde van los intereses de esta tarjeta («Gastos financieros» por
    // defecto). Se guarda el id para no buscar nunca por nombre.
    interestCategoryId: v.optional(v.id("categories")),
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
    .index("by_user_status", ["userId", "status"])
    .index("by_user_status_purchaseDate", ["userId", "status", "purchaseDate"]),

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
    // Lo abonado a esta cuota (centavos). Permite pagos parciales; `paid` se deriva
    // de él en `recomputeInstallmentsPaid`. Sin él (cuotas antiguas), manda `paid`.
    paidAmount: v.optional(v.number()),
    // "at_cutoff": el interés de la cuota se cobra cuando se factura (modelo de la
    // fase 3). Sin él, la cuota es del modelo anterior y su interés ya estaba en la
    // deuda desde la compra. La migración `migrateCardInterestModel` lo pone.
    interestBilling: v.optional(v.literal("at_cutoff")),
    // Cuándo la cuota cuenta como gasto: el día de la compra más un mes por cuota.
    // Es la fecha del movimiento, y NO depende del corte (ver lib/cardSchedule.ts).
    expenseDate: v.optional(v.number()),
    // Cuándo se registró ese gasto.
    expensedAt: v.optional(v.number()),
    // Cuándo entró al extracto y se cobró su interés (en el corte de `dueDate`).
    // Lo pone el cron `billCardInstallments`, o la compra misma si ya tocaba.
    billedAt: v.optional(v.number()),
    transactionId: v.optional(v.id("transactions")),
    createdAt: v.number(),
  })
    .index("by_purchase", ["purchaseId"])
    .index("by_billing_due", ["interestBilling", "billedAt", "dueDate"])
    .index("by_expense_due", ["interestBilling", "expensedAt", "expenseDate"])
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
    archived: v.optional(v.boolean()),  // archivada: fuera de la lista y de las alertas
    // Excluir del patrimonio neto. Optativo a propósito: las filas que ya existen
    // no lo traen y se leen como incluidas (`!== false`), igual que en `accounts`.
    includeInBalance: v.optional(v.boolean()),
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
    isSystem: v.optional(v.boolean()),  // categorías protegidas del sistema (no editables por el usuario)
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
    notifiedAt: v.optional(v.number()),         // ts de la primera alerta de umbral
    exceededNotifiedAt: v.optional(v.number()), // ts de la primera alerta de excedido
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
  //   - Ambas piernas usan type "transferencia", distinguidas por transferDirection ("out"/"in")
  //   - Transacción de salida: accountId = cuenta origen, transferDirection = "out"
  //   - Transacción de entrada: accountId = cuenta destino, transferDirection = "in"
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
      v.literal("gasto_tarjeta"),      // gasto con tarjeta de crédito (no descuenta cuenta)
      v.literal("ajuste"),            // reasignación manual de saldo
      v.literal("prestamo_otorgado"), // dinero prestado: salida de cuenta, NO es gasto del P&L
      v.literal("prestamo_cobrado"),  // cobro de préstamo: entrada a cuenta, NO es ingreso del P&L
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
    // Qué es una gasto_tarjeta ligada a una cuota: el capital de la cuota o su
    // interés. Sin él, gasto_tarjeta del modelo anterior (cuota entera).
    cardChargeKind: v.optional(v.union(v.literal("cuota"), v.literal("interes"))),
    debtId: v.optional(v.id("debts")),
    loanId: v.optional(v.id("loans")),
    goalId: v.optional(v.id("goals")),      // gasto vinculado a meta de ahorro (ahorro en casa)
    transferDirection: v.optional(v.union(v.literal("out"), v.literal("in"))),

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
    .index("by_card_installment", ["cardId", "cardInstallmentId"])
    .index("by_user_type_month", ["userId", "type", "month"])
    .index("by_user_category_month", ["userId", "categoryId", "month"])
    .index("by_transfer_group", ["transferGroupId"])
    .searchIndex("search_description", {
      searchField: "description",
      filterFields: ["userId", "type"],
    }),

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
    active: v.boolean(),            // false = eliminado (soft delete)
    paused: v.optional(v.boolean()), // pausado por el usuario: el cron lo salta
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
      v.literal("prestamo_vencido"),
      v.literal("prestamo_proximo"),
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

  // ============================================================
  // PRÉSTAMOS — Dinero que el usuario prestó a otras personas
  // ============================================================
  loans: defineTable({
    userId: v.string(),
    name: v.string(),                      // descripción corta del préstamo
    borrower: v.string(),                  // a quién se le prestó
    originalAmount: v.number(),            // monto original en centavos
    currentBalance: v.number(),            // saldo pendiente de cobro en centavos
    currency: v.string(),
    startDate: v.number(),                 // fecha en que se hizo el préstamo
    dueDate: v.optional(v.number()),       // fecha esperada de devolución
    status: v.union(
      v.literal("activa"),
      v.literal("pagada"),
      v.literal("vencida"),
    ),
    color: v.string(),
    icon: v.string(),
    archived: v.boolean(),
    notes: v.optional(v.string()),
    // Excluir del patrimonio neto. Optativo a propósito: las filas que ya existen
    // no lo traen y se leen como incluidas (`!== false`), igual que en `accounts`.
    includeInBalance: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_user_archived", ["userId", "archived"])
    .index("by_status_dueDate", ["status", "dueDate"]),

  // ============================================================
  // ABONOS DE PRÉSTAMOS — Historial de pagos recibidos
  // ============================================================
  loanRepayments: defineTable({
    userId: v.string(),
    loanId: v.id("loans"),
    amount: v.number(),                    // centavos
    currency: v.string(),
    date: v.number(),
    month: v.string(),                     // "YYYY-MM"
    transactionId: v.optional(v.id("transactions")),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_loan", ["loanId"])
    .index("by_user_month", ["userId", "month"]),

  // ============================================================
  // METAS DE AHORRO — Objetivos financieros personales
  // El progreso es manual: el usuario abona importes hasta completar la meta.
  // ============================================================
  goals: defineTable({
    userId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    targetAmount: v.number(),        // monto objetivo en centavos
    currentAmount: v.number(),       // acumulado hasta ahora en centavos
    currency: v.string(),
    deadline: v.optional(v.number()), // timestamp de fecha límite
    icon: v.string(),                 // emoji representativo
    color: v.string(),
    status: v.union(v.literal("activa"), v.literal("completada")),
    linkedAccountId: v.optional(v.id("accounts")), // meta cuyo progreso refleja el saldo de una cuenta de ahorro
    notes: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_linkedAccount", ["linkedAccountId"]),

  // ============================================================
  // SNAPSHOTS DE PATRIMONIO NETO — Histórico mensual
  // Capturados el día 1 de cada mes antes del rollover de presupuestos.
  // No se pueden recuperar retroactivamente — implementar desde el inicio.
  // ============================================================
  netWorthSnapshots: defineTable({
    userId:               v.string(),
    month:                v.string(),   // "YYYY-MM" del mes capturado
    totalAssets:          v.number(),   // centavos
    totalCardDebt:        v.number(),   // centavos
    totalDebt:            v.number(),   // centavos
    totalLoansReceivable: v.number(),   // centavos
    netWorth:             v.number(),   // centavos
    currency:             v.string(),
    createdAt:            v.number(),
  })
    .index("by_user_month", ["userId", "month"]),

  // ============================================================
  // LATIDO DE LOS TRABAJOS PROGRAMADOS
  // Convex no guarda historial de ejecuciones, así que sin esta tabla no hay
  // forma de saber si un cron dejó de correr. Las filas las escribe siempre
  // registrarEjecucion() de convex/lib/cronHeartbeat.ts.
  //
  // Una fila solo se crea cuando la ejecución YA TERMINÓ, así que finishedAt y
  // durationMs son obligatorios: no existe el estado «empezó y sigue
  // corriendo». Un job que se cuelga no deja fila a medias, no deja fila
  // ninguna — y ese caso lo detecta el panel por caducidad (comparando la
  // última fila con el everyMs de CRON_JOBS), no buscando campos vacíos.
  // ============================================================
  cronRuns: defineTable({
    job: v.string(),
    startedAt: v.number(),
    finishedAt: v.number(),
    ok: v.boolean(),
    error: v.optional(v.string()),   // solo cuando ok === false
    durationMs: v.number(),
  })
    .index("by_job", ["job"]),

  // ============================================================
  // CONTADORES POR USUARIO — materializados por RECÁLCULO, no write-through
  // Los recalcula un cron diario (y el botón del panel) desde los índices
  // by_user. No se incrementan en cada escritura a propósito: eso obligaría a
  // tocar todas las rutas de escritura y una sola olvidada haría mentir los
  // números en silencio. Ver el spec del 2026-09-20.
  // ============================================================
  userStats: defineTable({
    userId: v.string(),
    counts: v.record(v.string(), v.number()),
    capped: v.boolean(),
    computedAt: v.number(),
  })
    .index("by_user", ["userId"]),
});
