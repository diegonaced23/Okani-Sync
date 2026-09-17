"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function ExportDataCard() {
  const exportMyData = useAction(api.actions.exportMyData.run);
  const [loading, setLoading] = useState(false);
  const [truncadas, setTruncadas] = useState<string[]>([]);

  async function handleExport() {
    setLoading(true);
    setTruncadas([]);
    try {
      const { url, truncatedTables } = await exportMyData();
      setTruncadas(truncatedTables);
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
      toast.success("Descarga lista");
    } catch {
      toast.error("No se pudo generar la exportación");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl bg-card border border-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Download className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Exportar mis datos</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Descarga un archivo JSON con tus cuentas, movimientos, tarjetas, deudas,
        préstamos, presupuestos y metas. El enlace caduca en una hora.
      </p>
      <Button variant="outline" className="gap-2" onClick={handleExport} disabled={loading}>
        <Download className="h-4 w-4" />
        {loading ? "Preparando…" : "Descargar respaldo"}
      </Button>
      {truncadas.length > 0 && (
        <p className="text-xs text-warning" role="alert">
          El respaldo quedó incompleto en: {truncadas.join(", ")}. Se exportaron
          las primeras 10 000 filas de cada una.
        </p>
      )}
    </div>
  );
}
