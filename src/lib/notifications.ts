/**
 * Preferencias de notificación por familia.
 *
 * Vive en `src/lib/` y no en `convex/` porque lo consumen los dos lados: la
 * tarjeta de preferencias del perfil y el punto de control de los crons
 * (`convex/lib/notify.ts`). Es el mismo patrón que ya usa `convex/users.ts`
 * importando `../src/lib/constants`.
 */

/** Los 15 literales de `notifications.type` en convex/schema.ts. */
export type NotificationType =
  | "presupuesto_alerta"
  | "presupuesto_excedido"
  | "cuota_proxima"
  | "deuda_vencida"
  | "deuda_proxima"
  | "prestamo_vencido"
  | "prestamo_proximo"
  | "recordatorio_registro"
  | "transaccion_recurrente"
  | "resumen_semanal"
  | "resumen_mensual"
  | "pago_tarjeta_proximo"
  | "cuenta_compartida"
  | "share_aceptado"
  | "sistema";

export type NotificationPrefKey =
  | "presupuestos"
  | "tarjetas"
  | "deudasPrestamos"
  | "recurrentes"
  | "recordatorioDiario"
  | "resumenes";

export type NotificationPrefs = Record<NotificationPrefKey, boolean>;

export const NOTIFICATION_PREF_KEYS = [
  "presupuestos",
  "tarjetas",
  "deudasPrestamos",
  "recurrentes",
  "recordatorioDiario",
  "resumenes",
] as const satisfies readonly NotificationPrefKey[];

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  presupuestos: true,
  tarjetas: true,
  deudasPrestamos: true,
  recurrentes: true,
  recordatorioDiario: true,
  resumenes: true,
};

export const NOTIFICATION_PREF_LABELS: Record<
  NotificationPrefKey,
  { title: string; description: string }
> = {
  presupuestos: {
    title: "Presupuestos",
    description: "Cuando te acercas al umbral o lo superas",
  },
  tarjetas: {
    title: "Tarjetas de crédito",
    description: "Cuotas y pagos próximos a vencer",
  },
  deudasPrestamos: {
    title: "Deudas y préstamos",
    description: "Vencimientos propios y de quienes te deben",
  },
  recurrentes: {
    title: "Movimientos recurrentes",
    description: "Cuando se genera un movimiento automático",
  },
  recordatorioDiario: {
    title: "Recordatorio diario",
    description: "Aviso al final del día si no registraste nada",
  },
  resumenes: {
    title: "Resúmenes",
    description: "Resumen semanal de los lunes y resumen mensual",
  },
};

/**
 * Familia configurable a la que pertenece un tipo, o `null` si el tipo no es
 * configurable. `cuenta_compartida`, `share_aceptado` y `sistema` son
 * interactivas o críticas (alguien te compartió una cuenta, tu acceso cambió):
 * silenciarlas dejaría al usuario sin enterarse de algo que requiere su acción.
 */
export function prefKeyForType(type: NotificationType): NotificationPrefKey | null {
  switch (type) {
    case "presupuesto_alerta":
    case "presupuesto_excedido":
      return "presupuestos";
    case "cuota_proxima":
    case "pago_tarjeta_proximo":
      return "tarjetas";
    case "deuda_vencida":
    case "deuda_proxima":
    case "prestamo_vencido":
    case "prestamo_proximo":
      return "deudasPrestamos";
    case "transaccion_recurrente":
      return "recurrentes";
    case "recordatorio_registro":
      return "recordatorioDiario";
    case "resumen_semanal":
    case "resumen_mensual":
      return "resumenes";
    case "cuenta_compartida":
    case "share_aceptado":
    case "sistema":
      return null;
  }
}

/**
 * `prefs` ausente o con la clave ausente significa ACTIVO. Es lo que mantiene
 * la retrocompatibilidad: ningún usuario existente pierde notificaciones al
 * desplegar el campo nuevo.
 */
export function isNotificationAllowed(
  type: NotificationType,
  prefs: Partial<NotificationPrefs> | undefined | null
): boolean {
  const key = prefKeyForType(type);
  if (key === null) return true;
  return prefs?.[key] ?? true;
}
