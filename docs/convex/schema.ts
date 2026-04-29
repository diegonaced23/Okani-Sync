import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Esquema de base de datos para Okany Sync
 * Aplicación PWA de gestión de finanzas personales
 *
 * Convenciones:
 * - Todos los timestamps se almacenan como números (Date.now())
 * - userId / ownerId siempre referencia al clerkId del usuario autenticado
 * - El campo `month` se guarda como "YYYY-MM" para indexar consultas mensuales
 * - Los montos se almacenan como números enteros (en la unidad menor de la moneda
 *   o como decimales según implementación; centralizado en lib/money.ts)
 * - Multi-moneda: cada cuenta/tarjeta tiene su propia moneda. La consolidación
 *   se hace contra la moneda preferida del usuario (default COP) usando exchangeRates.
 * - Cuentas compartidas: una cuenta tiene un `ownerId` y opcionalmente registros en
 *   `accountShares` que definen permisos para otros usuarios.
 */
export default defineSchema({
  // ============================================================
  // USUARIOS - Sincronizados desde Clerk vía webhook
  // ============================================================
  users: defineTable({
    clerkId: v.string(), // ID del usuario en Clerk
    email: v.string(),
    name: v.string(),
    imageUrl: v.optional(v.string()), // Avatar del usuario
    role: v.union(v.literal("admin"), v.literal("user")), // admin o user (los permisos para compartir cuentas viven en accountShares)
    active: v.boolean(), // Permite al admin desactivar usuarios
    locale: v.string(), // Por defecto "es-CO"
    currency: v.string(), // Moneda preferida del usuario para consolidar (default "COP")
    theme: v.optional(v.union(v.literal("light"), v.literal("dark"), v.literal("system"))),
    pushSubscription: v.optional(v.any()), // Web Push API subscription (endpoint, keys)
    createdAt: v.number(),
    updatedAt: v.number(),
    createdBy: v.optional(v.string()), // clerkId del admin que lo creó
    welcomeEmailSentAt: v.optional(v.number()), // Timestamp del envío del correo de bienvenida (Resend)
  })
    .index("by_clerkId", ["clerkId"])
    .index("by_email", ["email"])
    .index("by_role", ["role"]),

  // ============================================================
  // CUENTAS - Cuentas bancarias, ahorros y billetera (efectivo)
  // Soporta cuentas compartidas vía tabla accountShares.
  // ============================================================
  accounts: defineTable({
    ownerId: v.string(), // clerkId del propietario original
    name: v.string(), // Ej: "Bancolombia Ahorros", "Billetera"
    type: v.union(
      v.literal("billetera"), // Efectivo (cuenta por defecto)
      v.literal("bancaria"), // Cuenta corriente bancaria
      v.literal("ahorros"), // Cuenta de ahorros
      v.literal("inversion") // Cuenta de inversión
    ),
    bankName: v.optional(v.string()), // Nombre del banco (no aplica para billetera)
    accountNumber: v.optional(v.string()), // Últimos 4 dígitos o número enmascarado
    balance: v.number(), // Saldo actual en la moneda de la cuenta
    initialBalance: v.number(), // Saldo de apertura para conciliación
    currency: v.string(), // Ej: "COP", "USD", "EUR"
    color: v.string(), // Color hex para UI (ej: "#1F262A")
    icon: v.string(), // Identificador del icono (lucide-react)
    isDefault: v.boolean(), // true para la billetera por defecto
    isShared: v.boolean(), // true si tiene al menos un share aceptado
    archived: v.boolean(), // Soft delete: cuentas inactivas pero con histórico
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_archived", ["ownerId", "archived"])
    .index("by_owner_type", ["ownerId", "type"]),

  // ============================================================
  // COMPARTIR CUENTAS - Permisos por cuenta para otros usuarios
  // Permite que un usuario comparta una cuenta con otro con un nivel de permiso.
  // No se necesita un nuevo rol global; los permisos viven a nivel de cuenta.
  // ============================================================
  accountShares: defineTable({
    accountId: v.id("accounts"),
    ownerId: v.string(), // clerkId del dueño que compartió
    sharedWithUserId: v.string(), // clerkId del usuario invitado
    permission: v.union(
      v.literal("viewer"), // Solo puede ver saldo y transacciones
      v.literal("editor"), // Puede crear/editar transacciones, no eliminar la cuenta
      v.literal("admin") // Puede compartir con otros y editar la cuenta (no eliminarla)
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
  // TASAS DE CAMBIO - Para consolidar saldos en multi-moneda
  // Se mantiene un histórico para reportes precisos por fecha.
  // ============================================================
  exchangeRates: defineTable({
    fromCurrency: v.string(), // Ej: "USD"
    toCurrency: v.string(), // Ej: "COP"
    rate: v.number(), // Cuántas unidades de toCurrency por 1 fromCurrency
    source: v.union(
      v.literal("manual"), // Capturado manualmente por el usuario/admin
      v.literal("api") // Obtenido de un proveedor externo (ej: exchangerate.host)
    ),
    effectiveDate: v.number(), // Fecha a la que aplica esta tasa
    createdAt: v.number(),
    createdBy: v.optional(v.string()), // clerkId si fue manual
  })
    .index("by_pair", ["fromCurrency", "toCurrency"])
    .index("by_pair_date", ["fromCurrency", "toCurrency", "effectiveDate"]),

  // ============================================================
  // TARJETAS DE CRÉDITO
  // ============================================================
  cards: defineTable({
    userId: v.string(), // Las tarjetas son personales, no se comparten
    name: v.string(), // Ej: "Tarjeta Visa Bancolombia"
    bankName: v.string(),
    lastFourDigits: v.string(), // Solo los últimos 4 dígitos
    brand: v.optional(
      v.union(
        v.literal("visa"),
        v.literal("mastercard"),
        v.literal("amex"),
        v.literal("diners"),
        v.literal("otro")
      )
    ),
    creditLimit: v.number(), // Cupo total
    currentBalance: v.number(), // Deuda actual (lo que ya está usado)
    availableCredit: v.number(), // Cupo disponible (creditLimit - currentBalance)
    cutoffDay: v.number(), // Día de corte mensual (1-31)
    paymentDay: v.number(), // Día de pago mensual (1-31)
    interestRate: v.optional(v.number()), // Tasa de interés efectiva mensual default (decimal: 0.025 = 2.5%)
    minimumPayment: v.optional(v.number()), // Pago mínimo último corte
    currency: v.string(),
    color: v.string(),
    icon: v.string(),
    archived: v.boolean(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_archived", ["userId", "archived"]),

  // ============================================================
  // COMPRAS A CUOTAS DE TARJETA DE CRÉDITO
  // Cálculo de cuota con interés compuesto:
  //   M = P * (i * (1+i)^n) / ((1+i)^n - 1)
  // Donde P=monto, i=tasa mensual (decimal), n=número de cuotas
  // ============================================================
  cardPurchases: defineTable({
    userId: v.string(),
    cardId: v.id("cards"),
    categoryId: v.optional(v.id("categories")),
    description: v.string(), // Descripción de la compra
    totalAmount: v.number(), // Monto base de la compra (sin intereses)
    totalWithInterest: v.number(), // Monto total a pagar (con intereses si aplica)
    totalInstallments: v.number(), // Número total de cuotas (1 = compra única)
    paidInstallments: v.number(), // Cuotas ya pagadas
    amountPerInstallment: v.number(), // Cuota mensual calculada
    hasInterest: v.boolean(), // Si la compra genera intereses
    interestRate: v.optional(v.number()), // Tasa mensual aplicada (decimal). Ej: 0.08 = 8%
    totalInterest: v.optional(v.number()), // Total de intereses pagados (totalWithInterest - totalAmount)
    currency: v.string(),
    purchaseDate: v.number(), // Fecha de la compra
    firstInstallmentDate: v.number(), // Fecha de la primera cuota
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
  // CUOTAS INDIVIDUALES (cronograma de pagos por compra)
  // Para interés compuesto se almacena el desglose capital/interés por cuota.
  // ============================================================
  cardInstallments: defineTable({
    userId: v.string(),
    purchaseId: v.id("cardPurchases"),
    cardId: v.id("cards"),
    installmentNumber: v.number(), // Número de cuota (1, 2, 3...)
    amount: v.number(), // Monto total de la cuota (capital + interés)
    principalAmount: v.optional(v.number()), // Parte de capital
    interestAmount: v.optional(v.number()), // Parte de interés
    remainingPrincipal: v.optional(v.number()), // Saldo de capital después de pagar esta cuota
    dueDate: v.number(), // Fecha de vencimiento
    month: v.string(), // "YYYY-MM" para reportes
    paid: v.boolean(),
    paidAt: v.optional(v.number()),
    transactionId: v.optional(v.id("transactions")), // Vínculo a la transacción del pago
    createdAt: v.number(),
  })
    .index("by_purchase", ["purchaseId"])
    .index("by_user_month", ["userId", "month"])
    .index("by_card_month", ["cardId", "month"])
    .index("by_user_paid", ["userId", "paid"]),

  // ============================================================
  // DEUDAS - Préstamos, deudas con personas, etc.
  // ============================================================
  debts: defineTable({
    userId: v.string(),
    name: v.string(), // Ej: "Préstamo personal", "Deuda con Juan"
    description: v.optional(v.string()),
    creditor: v.string(), // A quién se le debe (persona, banco, entidad)
    type: v.union(
      v.literal("prestamo"), // Préstamo bancario
      v.literal("personal"), // Deuda con persona
      v.literal("hipoteca"),
      v.literal("vehiculo"),
      v.literal("otro")
    ),
    originalAmount: v.number(), // Monto original
    currentBalance: v.number(), // Saldo pendiente
    interestRate: v.optional(v.number()), // Tasa de interés mensual (decimal)
    monthlyPayment: v.optional(v.number()), // Cuota mensual sugerida
    startDate: v.number(),
    dueDate: v.optional(v.number()), // Fecha límite de pago
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
    .index("by_user_status", ["userId", "status"]),

  // ============================================================
  // PAGOS A DEUDAS - Histórico de abonos
  // ============================================================
  debtPayments: defineTable({
    userId: v.string(),
    debtId: v.id("debts"),
    amount: v.number(),
    currency: v.string(),
    date: v.number(),
    month: v.string(), // "YYYY-MM"
    transactionId: v.optional(v.id("transactions")), // Vínculo con la transacción
    notes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_debt", ["debtId"])
    .index("by_user_month", ["userId", "month"]),

  // ============================================================
  // CATEGORÍAS - Para clasificar ingresos y gastos
  // ============================================================
  categories: defineTable({
    userId: v.string(), // Las categorías son personales por usuario
    name: v.string(), // Ej: "Alimentación", "Transporte", "Salario"
    type: v.union(
      v.literal("ingreso"),
      v.literal("gasto"),
      v.literal("ambos") // Categoría que aplica a ingresos y gastos
    ),
    color: v.string(), // Color hex para gráficos
    icon: v.string(), // Icono (lucide-react)
    parentId: v.optional(v.id("categories")), // Para subcategorías
    isDefault: v.boolean(), // Categorías predefinidas del sistema
    archived: v.boolean(),
    order: v.optional(v.number()), // Orden de presentación
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_type", ["userId", "type"])
    .index("by_user_archived", ["userId", "archived"]),

  // ============================================================
  // PRESUPUESTOS - Por categoría y mes
  // ============================================================
  budgets: defineTable({
    userId: v.string(),
    categoryId: v.id("categories"),
    amount: v.number(), // Monto presupuestado en la moneda preferida del usuario
    spent: v.number(), // Monto gastado (calculado, se actualiza con cada transacción)
    currency: v.string(), // Generalmente la moneda preferida del usuario
    month: v.string(), // "YYYY-MM"
    notes: v.optional(v.string()),
    alertThreshold: v.optional(v.number()), // % a partir del cual notificar (ej: 80)
    notifiedAt: v.optional(v.number()), // Última vez que se envió alerta
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_month", ["userId", "month"])
    .index("by_user_category_month", ["userId", "categoryId", "month"]),

  // ============================================================
  // TRANSACCIONES - Ingresos, gastos y transferencias
  // En cuentas compartidas, userId = quien creó la transacción
  // accountId determina el dueño/compartido de la cuenta vinculada.
  // ============================================================
  transactions: defineTable({
    userId: v.string(), // Quién registró la transacción
    type: v.union(
      v.literal("ingreso"),
      v.literal("gasto"),
      v.literal("transferencia"),
      v.literal("pago_tarjeta"), // Pago a tarjeta de crédito
      v.literal("pago_deuda") // Pago a deuda registrada
    ),
    amount: v.number(),
    description: v.string(),
    date: v.number(), // Timestamp de la transacción
    month: v.string(), // "YYYY-MM" - índice para reportes
    currency: v.string(),

    // Origen (cuenta o tarjeta de la que sale el dinero)
    accountId: v.optional(v.id("accounts")),
    cardId: v.optional(v.id("cards")),

    // Para transferencias entre cuentas
    toAccountId: v.optional(v.id("accounts")),

    // Para transferencias entre monedas: tasa usada y monto destino
    exchangeRate: v.optional(v.number()),
    toAmount: v.optional(v.number()),
    toCurrency: v.optional(v.string()),

    // Categoría
    categoryId: v.optional(v.id("categories")),

    // Vínculos opcionales con otros registros
    cardPurchaseId: v.optional(v.id("cardPurchases")), // Si es una compra a cuotas
    cardInstallmentId: v.optional(v.id("cardInstallments")), // Si es el pago de una cuota
    debtId: v.optional(v.id("debts")), // Si es pago a una deuda

    // Archivos adjuntos (recibos, facturas) - SIEMPRE OPCIONAL
    receiptStorageId: v.optional(v.id("_storage")), // Convex Files
    receiptUrl: v.optional(v.string()), // URL pública si se generó

    // Estado
    status: v.union(
      v.literal("completada"),
      v.literal("pendiente"),
      v.literal("cancelada")
    ),

    // Para transacciones recurrentes
    isRecurring: v.boolean(),
    recurringId: v.optional(v.id("recurringTransactions")),

    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())), // Etiquetas opcionales
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
    .index("by_user_category_month", ["userId", "categoryId", "month"]),

  // ============================================================
  // TRANSACCIONES RECURRENTES - Plantillas para auto-generar
  // ============================================================
  recurringTransactions: defineTable({
    userId: v.string(),
    type: v.union(v.literal("ingreso"), v.literal("gasto")),
    amount: v.number(),
    description: v.string(),
    accountId: v.optional(v.id("accounts")),
    cardId: v.optional(v.id("cards")),
    categoryId: v.optional(v.id("categories")),
    frequency: v.union(
      v.literal("diaria"),
      v.literal("semanal"),
      v.literal("quincenal"),
      v.literal("mensual"),
      v.literal("anual")
    ),
    dayOfMonth: v.optional(v.number()), // Día del mes para frecuencia mensual
    startDate: v.number(),
    endDate: v.optional(v.number()), // null = sin fin
    nextOccurrence: v.number(), // Próxima fecha en que se debe generar
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
  // SESIONES - Registro de sesiones activas (para "cerrar sesiones")
  // Nota: Clerk maneja las sesiones reales. Aquí guardamos un log opcional.
  // ============================================================
  sessions: defineTable({
    userId: v.string(),
    clerkSessionId: v.string(),
    device: v.optional(v.string()), // User agent simplificado
    ipAddress: v.optional(v.string()),
    location: v.optional(v.string()),
    lastActiveAt: v.number(),
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_clerk_session", ["clerkSessionId"]),

  // ============================================================
  // LOG DE AUDITORÍA - Acciones administrativas y cambios sensibles
  // Importante para el borrado en cascada (registrar qué se eliminó)
  // ============================================================
  auditLogs: defineTable({
    userId: v.string(), // Quién hizo la acción
    targetUserId: v.optional(v.string()), // Sobre quién se hizo (admin actions)
    action: v.string(), // Ej: "user.created", "user.deleted", "account.shared"
    entity: v.optional(v.string()), // Nombre de la tabla/entidad afectada
    entityId: v.optional(v.string()),
    metadata: v.optional(v.any()), // Detalles adicionales
    ipAddress: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_action", ["action"])
    .index("by_target", ["targetUserId"]),

  // ============================================================
  // NOTIFICACIONES - Alertas en la app + Web Push
  // ============================================================
  notifications: defineTable({
    userId: v.string(),
    type: v.union(
      v.literal("presupuesto_alerta"),
      v.literal("presupuesto_excedido"),
      v.literal("cuota_proxima"),
      v.literal("deuda_vencida"),
      v.literal("pago_tarjeta_proximo"),
      v.literal("cuenta_compartida"), // Otro usuario compartió una cuenta
      v.literal("share_aceptado"), // Aceptaron una invitación de compartir
      v.literal("sistema")
    ),
    title: v.string(),
    message: v.string(),
    read: v.boolean(),
    pushSent: v.boolean(), // Si ya se envió como Web Push
    actionUrl: v.optional(v.string()),
    relatedEntityId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_read", ["userId", "read"])
    .index("by_user_push_sent", ["userId", "pushSent"]),
});
