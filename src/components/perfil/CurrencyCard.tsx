"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { CURRENCIES } from "@/lib/constants";
import { Globe, Loader2 } from "lucide-react";
import { haptic } from "@/lib/ios";
import { SettingsCard } from "./SettingsCard";

export function CurrencyCard({ currency, index }: { currency: string; index?: number }) {
  const updateCurrency = useMutation(api.users.updateCurrency);
  const [saving, setSaving] = useState(false);

  async function handleCurrencyChange(next: string) {
    if (next === currency) return;
    haptic();
    setSaving(true);
    try {
      await updateCurrency({ currency: next });
      toast.success(`Moneda preferida: ${next}`);
    } catch {
      toast.error("No se pudo actualizar la moneda");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsCard
      icon={Globe}
      tone="var(--os-cyan)"
      title="Moneda preferida"
      index={index}
      // El texto anterior decía «para consolidar el balance total en el dashboard», y
      // se queda muy corto: es la moneda a la que se convierte TODO lo que la
      // aplicación suma entre cuentas, tarjetas, deudas y presupuestos.
      description="Es la moneda en la que se te presentan todos los totales que mezclan varias monedas: patrimonio, resúmenes del mes, presupuestos y deudas."
      footnote={
        // Dato real y fácil de descubrir tarde: los snapshots mensuales de patrimonio
        // guardan la moneda que estaba vigente al capturarlos y no se recalculan.
        <>
          Los puntos ya archivados del histórico de patrimonio conservan la moneda que
          tenías cuando se guardaron: si la cambias, esa gráfica mezclará unidades en los
          meses anteriores y te lo avisará allí.
        </>
      }
    >
      <div className="flex items-center gap-2">
        <Select
          value={currency}
          onValueChange={(v) => { if (v) handleCurrencyChange(v); }}
        >
          <SelectTrigger className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.symbol} {c.code} — {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {saving && (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
        )}
      </div>
    </SettingsCard>
  );
}
