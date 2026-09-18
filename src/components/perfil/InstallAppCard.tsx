"use client";

import { CheckCircle2, Download, Share, SquarePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePwaInstall } from "@/hooks/usePwaInstall";

export function InstallAppCard() {
  const { status, install } = usePwaInstall();

  async function handleInstall() {
    const accepted = await install();
    if (accepted) toast.success("Okany se está instalando en tu dispositivo");
  }

  return (
    <div className="rounded-xl bg-card border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {status === "installed" ? (
            <CheckCircle2 className="h-4 w-4 text-accent" aria-hidden="true" />
          ) : (
            <Download className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          )}
          <div>
            <p className="text-sm font-semibold text-foreground">Instalar app</p>
            <p className="text-xs text-muted-foreground">
              {status === "installed" && "Ya estás usando la app instalada"}
              {status === "available" && "Ábrela desde tu pantalla de inicio, como una app nativa"}
              {status === "ios"       && "Agrégala a tu pantalla de inicio desde Safari"}
              {status === "manual"    && "Instálala desde el menú de tu navegador"}
              {status === "loading"   && "Verificando…"}
            </p>
          </div>
        </div>
        {status === "available" && (
          <Button size="sm" onClick={handleInstall}>
            Instalar
          </Button>
        )}
      </div>

      {status === "ios" && (
        <ol className="mt-3 space-y-1.5 text-xs text-muted-foreground list-decimal pl-5">
          <li>
            Toca <Share className="inline h-3.5 w-3.5 align-text-bottom" aria-label="Compartir" />{" "}
            <span className="font-medium text-foreground">Compartir</span> en la barra del navegador.
          </li>
          <li>
            Elige <SquarePlus className="inline h-3.5 w-3.5 align-text-bottom" aria-hidden="true" />{" "}
            <span className="font-medium text-foreground">Agregar a inicio</span>.
          </li>
          <li>Confirma con <span className="font-medium text-foreground">Agregar</span>.</li>
        </ol>
      )}

      {status === "manual" && (
        <p className="mt-2 text-xs text-muted-foreground">
          Busca «Instalar app» o «Agregar a la pantalla de inicio» en el menú del navegador.
          En Safari para Mac: Archivo → Agregar al Dock.
        </p>
      )}
    </div>
  );
}
