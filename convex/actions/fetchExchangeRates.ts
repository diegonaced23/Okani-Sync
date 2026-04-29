"use node";
import { internalAction } from "../_generated/server";
import { EXCHANGE_RATE_PAIRS } from "../../src/lib/constants";

// Stub — implementación completa en Sprint 7
export const run = internalAction({
  args: {},
  handler: async (_ctx) => {
    console.log("fetchExchangeRates: pendiente de implementación (Sprint 7)");
    // Llamar a https://api.exchangerate.host/latest?base=COP&symbols=USD,EUR,MXN,GBP
    // Validar delta < 20% vs última tasa conocida
    // Insertar en exchangeRates + actualizar currentExchangeRates
    void EXCHANGE_RATE_PAIRS; // evitar lint unused
  },
});
