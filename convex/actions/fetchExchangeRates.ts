"use node";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

// Pares que actualizamos diariamente (COP como base)
const PAIRS_FROM_COP = ["USD", "EUR", "MXN", "GBP"] as const;

// Validación de delta máximo permitido entre la nueva tasa y la anterior
const MAX_DELTA_PERCENT = 0.20; // 20%

export const run = internalAction({
  args: {},
  handler: async (ctx) => {
    try {
      // Obtener tasas COP como base
      const res = await fetch(
        `https://open.er-api.com/v6/latest/COP`,
        { signal: AbortSignal.timeout(10_000) }
      );

      if (!res.ok) {
        console.error(`fetchExchangeRates: HTTP ${res.status}`);
        return;
      }

      const data = (await res.json()) as {
        result: string;
        rates: Record<string, number>;
        time_last_update_unix: number;
      };

      if (data.result !== "success") {
        console.error("fetchExchangeRates: API returned non-success result");
        return;
      }

      const effectiveDate = (data.time_last_update_unix ?? Date.now() / 1000) * 1000;

      for (const toCurrency of PAIRS_FROM_COP) {
        const rate = data.rates[toCurrency];
        if (!rate || rate <= 0) {
          console.warn(`fetchExchangeRates: tasa ${toCurrency} no disponible`);
          continue;
        }

        // Validar delta contra la última tasa conocida
        const current = await ctx.runQuery(internal.exchangeRates.getCurrentInternal, {
          fromCurrency: "COP",
          toCurrency,
        });

        if (current) {
          const delta = Math.abs(rate - current.rate) / current.rate;
          if (delta > MAX_DELTA_PERCENT) {
            console.warn(
              `fetchExchangeRates: tasa COP→${toCurrency} cambió ${(delta * 100).toFixed(1)}% ` +
              `(anterior: ${current.rate}, nueva: ${rate}) — ignorando por anomalía`
            );
            continue;
          }
        }

        await ctx.runMutation(internal.exchangeRates.upsertCurrent, {
          fromCurrency: "COP",
          toCurrency,
          rate,
          effectiveDate,
        });

        // También insertar la inversa (ej: USD→COP = 1/rate)
        if (rate > 0) {
          await ctx.runMutation(internal.exchangeRates.upsertCurrent, {
            fromCurrency: toCurrency,
            toCurrency: "COP",
            rate: 1 / rate,
            effectiveDate,
          });
        }

        console.log(`fetchExchangeRates: COP→${toCurrency} = ${rate}`);
      }

      console.log("fetchExchangeRates: actualización completada");
    } catch (err) {
      console.error("fetchExchangeRates: error inesperado →", err);
    }
  },
});
