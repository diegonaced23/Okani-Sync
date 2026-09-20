"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { AlertTriangle, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/ios";
import { SettingsCard } from "./SettingsCard";

/** Tamaño legible del respaldo. La acción ya devolvía `sizeBytes` y nadie lo usaba. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("es-CO", { maximumFractionDigits: 1 })} MB`;
}

export function ExportDataCard({ index }: { index?: number }) {
  const exportMyData = useAction(api.actions.exportMyData.run);
  const [loading, setLoading] = useState(false);
  const [truncadas, setTruncadas] = useState<string[]>([]);
  const [lastSize, setLastSize] = useState<number | null>(null);

  async function handleExport() {
    haptic();
    setLoading(true);
    setTruncadas([]);
    setLastSize(null);
    try {
      const { url, truncatedTables, sizeBytes } = await exportMyData();
      setTruncadas(truncatedTables);
      setLastSize(sizeBytes);
      // La URL de storage de Convex es de otro origen (*.convex.cloud). El
      // atributo `download` de un <a> se ignora en enlaces cross-origin salvo
      // que el servidor envíe `Content-Disposition: attachment`, algo que no
      // controlamos aquí. Por eso se descarga el archivo como blob y se crea
      // una URL local con `URL.createObjectURL`: así el navegador siempre
      // respeta el nombre de archivo y dispara la descarga en vez de navegar
      // a la URL remota. No simplificar esto a `a.href = url` directo.
      const res = await fetch(url);
      if (!res.ok) throw new Error("No se pudo descargar el archivo de exportación");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `okany-sync-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      toast.success(`Descarga lista — ${formatSize(sizeBytes)}`);
    } catch {
      toast.error("No se pudo generar la exportación");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SettingsCard
      icon={Download}
      tone="var(--os-lime)"
      title="Exportar mis datos"
      index={index}
      // El texto anterior enumeraba siete tablas de las quince que la acción exporta,
      // así que parecía un respaldo parcial cuando en realidad es completo.
      description="Un archivo JSON con todo lo que la cuenta guarda: cuentas, movimientos, tarjetas y sus cuotas, deudas, préstamos, presupuestos, metas, recurrentes, categorías y el histórico de patrimonio. Los importes van en centavos y también en su valor decimal."
      footnote="El enlace caduca en una hora y el archivo se borra del servidor después."
    >
      <button
        type="button"
        onClick={handleExport}
        disabled={loading}
        className="touch-hit flex h-11 w-full items-center justify-center gap-2 rounded-[16px] bg-gradient-to-r from-emerald-400 to-teal-500 text-[14px] font-bold text-white shadow-[0_8px_20px_-10px_rgb(16_185_129/0.8)] transition-transform active:scale-[0.98] disabled:opacity-60"
      >
        {loading
          ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          : <Download className="h-4 w-4" aria-hidden="true" />}
        {loading ? "Preparando…" : "Descargar respaldo"}
      </button>

      {lastSize !== null && truncadas.length === 0 && (
        <p className="mt-2.5 text-center text-[11px] text-muted-foreground" role="status">
          Último respaldo: {formatSize(lastSize)}
        </p>
      )}

      {truncadas.length > 0 && (
        <p
          className="mt-2.5 flex items-start gap-1.5 rounded-[14px] bg-warning/10 p-2.5 text-[11px] leading-snug text-warning-text"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          El respaldo quedó incompleto en: {truncadas.join(", ")}. Se exportaron las primeras
          10 000 filas de cada una.
        </p>
      )}
    </SettingsCard>
  );
}
