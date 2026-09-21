import { describe, it, expect } from "vitest";
import {
  shouldRefreshLastSeen,
  LAST_SEEN_THROTTLE_MS,
  cronHealth,
  CRON_GRACE_MS,
  rateFreshness,
  activityStatus,
  formatStatCount,
  DORMANT_MS,
} from "@/lib/adminHealth";
import { STATS_COUNT_CAP, STATS_COUNT_CAP_LABEL } from "@/lib/constants";

describe("shouldRefreshLastSeen", () => {
  const ahora = 1_800_000_000_000;

  it("escribe la primera vez, cuando no hay valor previo", () => {
    expect(shouldRefreshLastSeen(undefined, ahora)).toBe(true);
  });

  it("no escribe si el valor previo es reciente", () => {
    expect(shouldRefreshLastSeen(ahora - 60_000, ahora)).toBe(false);
  });

  it("escribe cuando el valor previo supera el umbral", () => {
    expect(shouldRefreshLastSeen(ahora - LAST_SEEN_THROTTLE_MS - 1, ahora)).toBe(true);
  });

  it("no escribe justo en el umbral, para no rebotar en el límite", () => {
    expect(shouldRefreshLastSeen(ahora - LAST_SEEN_THROTTLE_MS, ahora)).toBe(false);
  });

  it("escribe si el reloj del cliente dejó una marca en el futuro", () => {
    expect(shouldRefreshLastSeen(ahora + 60_000, ahora)).toBe(true);
  });
});

describe("cronHealth", () => {
  const ahora = 1_800_000_000_000;
  const dia = 24 * 60 * 60 * 1000;
  const diario = dia;
  const semanal = 7 * dia;
  const mensual = 31 * dia;

  it("es 'unknown' cuando el job nunca ha corrido", () => {
    expect(cronHealth(undefined, diario, ahora)).toBe("unknown");
  });

  it("acepta null, que es lo que devuelve getOverview", () => {
    expect(cronHealth(null, diario, ahora)).toBe("unknown");
  });

  it("es 'failed' si la última ejecución falló, aunque sea reciente", () => {
    expect(cronHealth({ finishedAt: ahora - 1000, ok: false }, diario, ahora)).toBe("failed");
  });

  it("es 'ok' dentro de la periodicidad más el margen", () => {
    expect(cronHealth({ finishedAt: ahora - diario, ok: true }, diario, ahora)).toBe("ok");
  });

  /**
   * Las dos fronteras exactas, para las tres periodicidades que existen.
   *
   * El par «justo en el límite → ok» / «un milisegundo más → late» es lo que
   * detecta una inversión del operador: con `>=` en vez de `>`, el primero de
   * cada pareja pasaría a 'late' y estos casos fallarían.
   */
  for (const [nombre, everyMs] of [
    ["diario", diario],
    ["semanal", semanal],
    ["mensual", mensual],
  ] as const) {
    it(`es 'ok' justo en el límite del margen fijo (${nombre}), que es inclusivo`, () => {
      const borde = ahora - (everyMs + CRON_GRACE_MS);
      expect(cronHealth({ finishedAt: borde, ok: true }, everyMs, ahora)).toBe("ok");
    });

    it(`es 'late' un milisegundo después del límite (${nombre})`, () => {
      const pasado = ahora - (everyMs + CRON_GRACE_MS) - 1;
      expect(cronHealth({ finishedAt: pasado, ok: true }, everyMs, ahora)).toBe("late");
    });
  }

  /**
   * El caso que motivó cambiar el factor multiplicativo por un margen fijo.
   *
   * `captureNetWorth` falla el 1 de octubre: su transacción revierte y no deja
   * fila en `cronRuns`, así que la última sigue siendo la del 1 de septiembre.
   * Con el margen antiguo (`everyMs * 2` = 62 días) el panel decía «Al día»
   * hasta el 1 de noviembre, cuando la ejecución buena tapaba el hueco, y el
   * mes de patrimonio irrecuperable no aparecía nunca. Con el margen fijo la
   * ausencia sale a la luz unos días después de la ejecución que se perdió.
   */
  it("marca 'late' un job mensual que se saltó UNA ejecución", () => {
    // 34 días sin correr un job mensual: la ejecución del mes ya no llegó.
    const hueco = mensual + 3 * dia;
    expect(cronHealth({ finishedAt: ahora - hueco, ok: true }, mensual, ahora)).toBe("late");
    // Testigo de la regresión: con el factor multiplicativo (62 días) este
    // mismo hueco daba 'ok', y seguiría dándolo todo el mes de octubre.
    expect(hueco).toBeLessThan(mensual * 2);
  });

  it("no marca 'late' un job mensual que solo se desplazó unas horas", () => {
    expect(cronHealth({ finishedAt: ahora - (mensual + dia), ok: true }, mensual, ahora)).toBe("ok");
  });
});

describe("rateFreshness", () => {
  const ahora = 1_800_000_000_000;
  const h = 60 * 60 * 1000;

  it("es 'unknown' si nunca se actualizó", () => {
    expect(rateFreshness(undefined, ahora)).toBe("unknown");
  });

  it("es 'ok' hasta 25 horas", () => {
    expect(rateFreshness(ahora - 25 * h, ahora)).toBe("ok");
  });

  it("es 'ok' justo en el límite de 26 horas, que es inclusivo", () => {
    expect(rateFreshness(ahora - 26 * h, ahora)).toBe("ok");
  });

  it("es 'late' entre 26 y 48 horas", () => {
    expect(rateFreshness(ahora - 30 * h, ahora)).toBe("late");
  });

  it("es 'late' justo en el límite de 48 horas, que es inclusivo", () => {
    expect(rateFreshness(ahora - 48 * h, ahora)).toBe("late");
  });

  it("es 'failed' pasadas las 48 horas", () => {
    expect(rateFreshness(ahora - 49 * h, ahora)).toBe("failed");
  });
});

describe("activityStatus", () => {
  const ahora = 1_800_000_000_000;

  it("considera dormida la cuenta que nunca entró y no tiene movimientos", () => {
    expect(activityStatus(undefined, 0, ahora)).toBe("dormant");
  });

  it("no considera dormida a quien nunca entró pero sí registró movimientos", () => {
    expect(activityStatus(undefined, 5, ahora)).toBe("active");
  });

  it("considera dormida a quien lleva más del umbral sin entrar", () => {
    expect(activityStatus(ahora - DORMANT_MS - 1, 20, ahora)).toBe("dormant");
  });

  it("no considera dormida justo en el límite del umbral, que es inclusivo hacia activo", () => {
    expect(activityStatus(ahora - DORMANT_MS, 20, ahora)).toBe("active");
  });

  it("no considera dormida a quien entró hace poco", () => {
    expect(activityStatus(ahora - 1000, 0, ahora)).toBe("active");
  });

  // El tercer estado: sin fecha de acceso Y sin contadores calculados no se
  // sabe nada, y un 0 por defecto convertía esa ignorancia en "dormida".
  it("es 'unknown' si nunca entró y no hay contadores calculados", () => {
    expect(activityStatus(undefined, undefined, ahora)).toBe("unknown");
  });

  it("nunca es 'unknown' si hay fecha de acceso, aunque falten los contadores", () => {
    expect(activityStatus(ahora - 1000, undefined, ahora)).toBe("active");
    expect(activityStatus(ahora - DORMANT_MS - 1, undefined, ahora)).toBe("dormant");
  });
});

describe("formatStatCount", () => {
  it("formatea una cifra exacta con separador de miles", () => {
    expect(formatStatCount(1234, false)).toBe((1234).toLocaleString("es-CO"));
  });

  it("no marca como topada una cifra por debajo del tope, aunque capped sea true", () => {
    // Este es el defecto de UserRow: `capped` se enciende si CUALQUIER tabla
    // del usuario topó, así que 3 movimientos y 10.000 cuotas mostraban
    // «10.000+ movimientos».
    expect(formatStatCount(3, true)).toBe((3).toLocaleString("es-CO"));
  });

  it("marca como topada la cifra que llegó al tope con capped", () => {
    expect(formatStatCount(STATS_COUNT_CAP, true)).toBe(STATS_COUNT_CAP_LABEL);
  });

  it("no marca como topada una cifra en el tope si capped es false", () => {
    expect(formatStatCount(STATS_COUNT_CAP, false)).toBe(
      STATS_COUNT_CAP.toLocaleString("es-CO"),
    );
  });
});
