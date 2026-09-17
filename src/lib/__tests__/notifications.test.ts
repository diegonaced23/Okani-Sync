import { describe, it, expect } from "vitest";
import {
  prefKeyForType,
  isNotificationAllowed,
  DEFAULT_NOTIFICATION_PREFS,
  NOTIFICATION_PREF_KEYS,
  type NotificationType,
} from "../notifications";

describe("prefKeyForType", () => {
  const casos: Array<[NotificationType, string | null]> = [
    ["presupuesto_alerta", "presupuestos"],
    ["presupuesto_excedido", "presupuestos"],
    ["cuota_proxima", "tarjetas"],
    ["pago_tarjeta_proximo", "tarjetas"],
    ["deuda_vencida", "deudasPrestamos"],
    ["deuda_proxima", "deudasPrestamos"],
    ["prestamo_vencido", "deudasPrestamos"],
    ["prestamo_proximo", "deudasPrestamos"],
    ["transaccion_recurrente", "recurrentes"],
    ["recordatorio_registro", "recordatorioDiario"],
    ["resumen_semanal", "resumenes"],
    ["resumen_mensual", "resumenes"],
    ["cuenta_compartida", null],
    ["share_aceptado", null],
    ["sistema", null],
  ];

  it.each(casos)("mapea %s → %s", (tipo, esperado) => {
    expect(prefKeyForType(tipo)).toBe(esperado);
  });

  it("cubre los 15 tipos del schema", () => {
    expect(casos).toHaveLength(15);
  });
});

describe("isNotificationAllowed", () => {
  it("permite todo cuando el usuario no tiene preferencias guardadas", () => {
    expect(isNotificationAllowed("resumen_semanal", undefined)).toBe(true);
    expect(isNotificationAllowed("resumen_semanal", null)).toBe(true);
  });

  it("permite las familias que faltan en un objeto parcial", () => {
    expect(isNotificationAllowed("resumen_semanal", { presupuestos: false })).toBe(true);
  });

  it("bloquea la familia desactivada", () => {
    expect(isNotificationAllowed("presupuesto_excedido", { presupuestos: false })).toBe(false);
  });

  it("nunca bloquea los tipos no configurables, ni con todo apagado", () => {
    const todoApagado = Object.fromEntries(
      NOTIFICATION_PREF_KEYS.map((k) => [k, false])
    ) as Record<(typeof NOTIFICATION_PREF_KEYS)[number], boolean>;

    expect(isNotificationAllowed("cuenta_compartida", todoApagado)).toBe(true);
    expect(isNotificationAllowed("share_aceptado", todoApagado)).toBe(true);
    expect(isNotificationAllowed("sistema", todoApagado)).toBe(true);
  });

  it("el default trae las seis familias activas", () => {
    expect(Object.values(DEFAULT_NOTIFICATION_PREFS)).toEqual([true, true, true, true, true, true]);
    expect(NOTIFICATION_PREF_KEYS).toHaveLength(6);
  });
});
