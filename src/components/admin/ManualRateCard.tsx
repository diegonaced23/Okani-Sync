"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { PencilLine } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { AdminCard } from "./AdminCard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DecimalInput } from "@/components/ui/decimal-input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CURRENCIES } from "@/lib/constants";
import { errorMessage } from "@/lib/errorMessage";

/**
 * Fija una tasa manual entre dos monedas.
 *
 * `exchangeRates.setManualRate` ya exige `assertAdmin` (tarea 1): esta
 * tarjeta es solo el formulario. No tiene su propio `useQuery` de lectura:
 * la tasa vigente por par ya la muestra `RatesHealthCard`, y repetirla acá
 * sería una segunda fuente de la misma cifra, con su propio riesgo de
 * desincronizarse de la primera.
 */
export function ManualRateCard({ index = 0 }: { index?: number }) {
  const setManualRate = useMutation(api.exchangeRates.setManualRate);

  const [from, setFrom] = useState<string>(CURRENCIES[0].code);
  const [to, setTo] = useState<string>(CURRENCIES[1].code);
  const [rate, setRate] = useState("");
  const [guardando, setGuardando] = useState(false);

  const mismaMoneda = from === to;
  const parsed = parseFloat(rate);
  const rateValida = rate !== "" && Number.isFinite(parsed) && parsed > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mismaMoneda || !rateValida) return;

    setGuardando(true);
    try {
      await setManualRate({ fromCurrency: from, toCurrency: to, rate: parsed });
      toast.success(`Tasa manual ${from} → ${to} guardada`);
      setRate("");
    } catch (err) {
      toast.error(errorMessage(err, "No se pudo guardar la tasa"));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <AdminCard
      icon={PencilLine}
      tone="var(--os-orange)"
      title="Tasa manual"
      index={index}
      footnote="Esta tasa sobrescribe la tasa global que consolida el dashboard de TODOS los usuarios, no solo el de quien la fija. El cron diario solo toca los pares con COP de por medio, y descarta cualquier cambio de más del 20 % frente al valor anterior por sospecha de anomalía — así que para otros pares, o si la tasa manual dispara esa guardia, seguirá vigente hasta que alguien la corrija a mano."
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Desde</Label>
            <Select value={from} onValueChange={(v) => { if (v) setFrom(v); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Hacia</Label>
            <Select value={to} onValueChange={(v) => { if (v) setTo(v); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="mr-rate" className="text-[11px] text-muted-foreground">
            1 {from} = ? {to}
          </Label>
          <DecimalInput
            id="mr-rate"
            value={rate}
            onChange={setRate}
            maxDecimals={6}
            min={0}
            placeholder="0"
            required
          />
        </div>

        {mismaMoneda && (
          <p className="text-[12px] font-semibold text-destructive">
            El origen y el destino no pueden ser la misma moneda.
          </p>
        )}

        <Button type="submit" size="sm" disabled={guardando || mismaMoneda || !rateValida}>
          {guardando ? "Guardando…" : "Fijar tasa manual"}
        </Button>
      </form>
    </AdminCard>
  );
}
