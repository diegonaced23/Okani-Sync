import { query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser, getCurrentUserId } from "./lib/auth";
import { assertValidMonth } from "./lib/utils";

/**
 * Techo de filas por mes de un extracto.
 *
 * Es más alto que el de la lista de movimientos (300) porque aquí las filas no se
 * pintan todas: alimentan el CSV y el PDF, donde recortar en silencio convierte un
 * extracto en un extracto incompleto que se presenta como completo. Cuando se
 * alcanza, la query lo dice y la pantalla y el PDF lo repiten.
 */
export const STATEMENT_MONTH_CAP = 2000;

/** Máximo de meses que puede pedir un extracto de una vez. */
export const STATEMENT_MAX_MONTHS = 12;

/**
 * Movimientos de uno o varios meses para el extracto y el libro contable.
 *
 * Reemplaza a `transactions.listForExport` y al uso que la pantalla de reportes
 * hacía de `transactions.listByMonth`. Eran dos lecturas del mismo mes con topes
 * distintos —300 con recorte silencioso frente a `.collect()` sin límite—, así que
 * el «Extracto CSV» y el «Libro completo» del mismo período podían entregar
 * conjuntos distintos, y el contador «Registros» mostraba el tope como si fuera
 * el total.
 *
 * Devuelve TODOS los tipos, incluidos `gasto_tarjeta`, transferencias y ajustes:
 * filtrar es decisión de la pantalla, que necesita el conjunto entero para contar
 * cuántos hay de cada tipo. Los montos van en su moneda original, sin convertir:
 * un extracto es el registro de lo que pasó, y revaluarlo a la tasa de hoy lo
 * convertiría en otra cosa.
 */
export const statement = query({
  args: { months: v.array(v.string()) },
  handler: async (ctx, { months }) => {
    const clerkId = await getCurrentUserId(ctx);
    const safeMonths = months.slice(0, STATEMENT_MAX_MONTHS);
    // Sin esto un mes malformado recorre el índice by_user_month completo.
    safeMonths.forEach(assertValidMonth);

    const byMonth = await Promise.all(
      safeMonths.map((month) =>
        ctx.db
          .query("transactions")
          .withIndex("by_user_month", (q) => q.eq("userId", clerkId).eq("month", month))
          .order("desc")
          .take(STATEMENT_MONTH_CAP)
      )
    );

    // Qué meses se quedaron cortos, no solo si alguno lo hizo: con varios meses
    // pedidos, «hay más» sin decir dónde no sirve para nada.
    const truncatedMonths = safeMonths.filter((_, i) => byMonth[i].length === STATEMENT_MONTH_CAP);

    return {
      rows: byMonth.flat().sort((a, b) => b.date - a.date),
      months: safeMonths,
      /** Meses que alcanzaron el tope: su extracto está incompleto. */
      truncatedMonths,
      cap: STATEMENT_MONTH_CAP,
      /** Meses descartados por pedir más de STATEMENT_MAX_MONTHS. */
      droppedMonths: months.length - safeMonths.length,
    };
  },
});

/** Máximo de puntos que devuelve el histórico de patrimonio. */
export const NET_WORTH_HISTORY_CAP = 36;

/**
 * Histórico mensual de patrimonio neto.
 *
 * La tabla `netWorthSnapshots` la llena un cron el día 1 de cada mes desde el primer
 * despliegue y **no existía ninguna query que la leyera**: el único histórico de
 * patrimonio de la aplicación —el que su propio esquema advierte que «no se puede
 * recuperar retroactivamente»— no se veía en ninguna pantalla. Su único lector era
 * el respaldo en JSON.
 *
 * Devuelve solo los puntos guardados. El mes en curso no está y no puede estar: el
 * cron captura el mes anterior, así que la cifra de hoy la añade la pantalla desde
 * `accounts.netWorth`, que es la misma que muestra el dashboard. Se distinguen a
 * propósito: un punto guardado se calculó con las tasas de su momento y el punto en
 * vivo con las de hoy.
 */
export const netWorthHistory = query({
  args: { fromMonth: v.string(), toMonth: v.string() },
  handler: async (ctx, { fromMonth, toMonth }) => {
    assertValidMonth(fromMonth);
    assertValidMonth(toMonth);
    const user = await getCurrentUser(ctx);
    const preferredCurrency = user.currency ?? "COP";

    // "YYYY-MM" ordena igual como texto que como fecha, así que el rango del índice
    // resuelve el período completo en una sola lectura.
    const snapshots = await ctx.db
      .query("netWorthSnapshots")
      .withIndex("by_user_month", (q) =>
        q.eq("userId", user.clerkId).gte("month", fromMonth).lte("month", toMonth)
      )
      .take(NET_WORTH_HISTORY_CAP);

    // Monedas distintas de la preferida actual: el snapshot guarda la que estaba
    // vigente al capturarlo, y si el usuario la cambió después esos puntos no son
    // comparables con los nuevos. Convertirlos ahora sería inventar una historia
    // que no ocurrió, así que se avisa y se muestran tal cual.
    const otherCurrencies = [
      ...new Set(snapshots.map((s) => s.currency).filter((c) => c !== preferredCurrency)),
    ];

    return {
      points: snapshots.map((s) => ({
        month: s.month,
        netWorth: s.netWorth,
        totalAssets: s.totalAssets,
        totalCardDebt: s.totalCardDebt,
        totalDebt: s.totalDebt,
        totalLoansReceivable: s.totalLoansReceivable,
        currency: s.currency,
      })),
      currency: preferredCurrency,
      otherCurrencies,
    };
  },
});
