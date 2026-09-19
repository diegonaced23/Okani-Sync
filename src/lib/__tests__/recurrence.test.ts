import { describe, expect, it } from "vitest";
import {
  RUN_HOUR_UTC,
  dateKeyToTs,
  firstMonthlyDateKey,
  monthlyFactor,
  nextOccurrenceAfter,
  stepOccurrence,
  tsToDateKey,
  upcomingOccurrences,
} from "../recurrence";

const key = (ts: number) => tsToDateKey(ts);

describe("dateKeyToTs / tsToDateKey", () => {
  it("ida y vuelta a la hora fija", () => {
    const ts = dateKeyToTs("2026-03-05");
    expect(new Date(ts).getUTCHours()).toBe(RUN_HOUR_UTC);
    expect(key(ts)).toBe("2026-03-05");
  });

  it("rechaza fechas imposibles", () => {
    expect(() => dateKeyToTs("2026-02-30")).toThrow();
    expect(() => dateKeyToTs("2026-13-01")).toThrow();
    expect(() => dateKeyToTs("5/3/2026")).toThrow();
  });
});

describe("stepOccurrence", () => {
  it("mensual con día 31 se recorta en febrero y vuelve al 31 en marzo", () => {
    const jan = dateKeyToTs("2026-01-31");
    const feb = stepOccurrence("mensual", jan, 31);
    expect(key(feb)).toBe("2026-02-28");
    expect(key(stepOccurrence("mensual", feb, 31))).toBe("2026-03-31");
  });

  it("mensual cruza el año", () => {
    expect(key(stepOccurrence("mensual", dateKeyToTs("2026-12-15"), 15))).toBe("2027-01-15");
  });

  it("semanal y quincenal suman días exactos", () => {
    const start = dateKeyToTs("2026-09-28");
    expect(key(stepOccurrence("semanal", start))).toBe("2026-10-05");
    expect(key(stepOccurrence("quincenal", start))).toBe("2026-10-13");
  });

  it("anual desde 29 de febrero vuelve al 29 en bisiesto", () => {
    const leap = dateKeyToTs("2028-02-29");
    const next = stepOccurrence("anual", leap, 29);
    expect(key(next)).toBe("2029-02-28");
    const chain = upcomingOccurrences("anual", leap, 5, 29).map(key);
    expect(chain).toEqual(["2028-02-29", "2029-02-28", "2030-02-28", "2031-02-28", "2032-02-29"]);
  });

  it("normaliza horas viejas (00:00 o 12:00 UTC) a la hora fija", () => {
    const legacy = Date.UTC(2026, 8, 5, 0, 0);
    expect(new Date(stepOccurrence("semanal", legacy)).getUTCHours()).toBe(RUN_HOUR_UTC);
  });
});

describe("nextOccurrenceAfter", () => {
  it("avanza desde la ocurrencia anterior, no desde la hora del cron", () => {
    const due = dateKeyToTs("2026-10-05");
    // El cron corre unos segundos después de las 12:00 UTC
    const cronRun = Date.UTC(2026, 9, 5, 12, 0, 7);
    const next = nextOccurrenceAfter("semanal", due, cronRun);
    expect(key(next)).toBe("2026-10-12");
    // La siguiente semana el cron vuelve a encontrarla vencida el mismo día
    expect(next).toBeLessThanOrEqual(Date.UTC(2026, 9, 12, 12, 0, 2));
  });

  it("salta las fechas perdidas sin generar atrasos", () => {
    const old = dateKeyToTs("2026-01-10");
    const now = Date.UTC(2026, 8, 19, 15);
    expect(key(nextOccurrenceAfter("mensual", old, now, 10))).toBe("2026-10-10");
  });
});

describe("firstMonthlyDateKey", () => {
  it("usa este mes si el día aún no llega", () => {
    expect(firstMonthlyDateKey("2026-09-19", 25)).toBe("2026-09-25");
  });

  it("hoy no cuenta: pasa al mes siguiente", () => {
    expect(firstMonthlyDateKey("2026-09-19", 19)).toBe("2026-10-19");
    expect(firstMonthlyDateKey("2026-09-19", 5)).toBe("2026-10-05");
  });

  it("recorta el 31 a meses cortos", () => {
    expect(firstMonthlyDateKey("2026-09-19", 31)).toBe("2026-09-30");
    expect(firstMonthlyDateKey("2026-02-10", 31)).toBe("2026-02-28");
  });
});

describe("monthlyFactor", () => {
  it("equivalencias mensuales", () => {
    expect(monthlyFactor("mensual")).toBe(1);
    expect(monthlyFactor("anual")).toBeCloseTo(1 / 12);
    expect(monthlyFactor("semanal")).toBeCloseTo(4.333, 2);
    expect(monthlyFactor("quincenal")).toBeCloseTo(2.028, 2);
  });
});
