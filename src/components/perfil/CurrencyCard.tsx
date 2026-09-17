"use client";

import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { CURRENCIES } from "@/lib/constants";
import { Globe } from "lucide-react";

export function CurrencyCard({ currency }: { currency: string }) {
  const updateCurrency = useMutation(api.users.updateCurrency);

  async function handleCurrencyChange(currency: string) {
    try {
      await updateCurrency({ currency });
      toast.success(`Moneda preferida: ${currency}`);
    } catch {
      toast.error("Error al actualizar moneda");
    }
  }

  return (
    <div className="rounded-xl bg-card border border-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Moneda preferida</h2>
      </div>
      <Select
        value={currency}
        onValueChange={(v) => { if (v) handleCurrencyChange(v); }}
      >
        <SelectTrigger>
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
      <p className="text-xs text-muted-foreground">
        Usada para consolidar el balance total en el dashboard.
      </p>
    </div>
  );
}
