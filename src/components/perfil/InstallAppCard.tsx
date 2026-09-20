"use client";

import { CheckCircle2, Download, Share, SquarePlus } from "lucide-react";
import { toast } from "sonner";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { haptic } from "@/lib/ios";
import { SettingsCard } from "./SettingsCard";

const STATE_TEXT: Record<string, string> = {
  installed: "Ya estás usando la app instalada",
  available: "Ábrela desde tu pantalla de inicio, como una app nativa",
  ios:       "Agrégala a tu pantalla de inicio desde Safari",
  manual:    "Instálala desde el menú de tu navegador",
  loading:   "Verificando…",
};

export function InstallAppCard({ index }: { index?: number }) {
  const { status, install } = usePwaInstall();

  async function handleInstall() {
    haptic();
    const accepted = await install();
    if (accepted) toast.success("Okany se está instalando en tu dispositivo");
  }

  return (
    <SettingsCard
      icon={status === "installed" ? CheckCircle2 : Download}
      tone={status === "installed" ? "var(--os-lime)" : "var(--os-cyan)"}
      title="Instalar la app"
      index={index}
      description={STATE_TEXT[status] ?? ""}
    >
      {status === "available" && (
        <button
          type="button"
          onClick={handleInstall}
          className="touch-hit flex h-11 w-full items-center justify-center gap-2 rounded-[16px] bg-gradient-to-r from-cyan-400 to-sky-500 text-[14px] font-bold text-white shadow-[0_8px_20px_-10px_rgb(56_189_248/0.8)] transition-transform active:scale-[0.98]"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Instalar
        </button>
      )}

      {status === "ios" && (
        <ol className="list-decimal space-y-1.5 pl-5 text-xs text-muted-foreground">
          <li>
            Toca <Share className="inline h-3.5 w-3.5 align-text-bottom" aria-label="Compartir" />{" "}
            <span className="font-semibold text-foreground">Compartir</span> en la barra del navegador.
          </li>
          <li>
            Elige <SquarePlus className="inline h-3.5 w-3.5 align-text-bottom" aria-hidden="true" />{" "}
            <span className="font-semibold text-foreground">Agregar a inicio</span>.
          </li>
          <li>Confirma con <span className="font-semibold text-foreground">Agregar</span>.</li>
        </ol>
      )}

      {status === "manual" && (
        <p className="text-xs text-muted-foreground">
          Busca «Instalar app» o «Agregar a la pantalla de inicio» en el menú del navegador.
          En Safari para Mac: Archivo → Agregar al Dock.
        </p>
      )}
    </SettingsCard>
  );
}
