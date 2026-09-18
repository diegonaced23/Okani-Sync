"use client";

import { useCallback, useSyncExternalStore } from "react";

// `beforeinstallprompt` no está en lib.dom: solo lo emiten Chromium (Chrome,
// Edge, Samsung Internet, Android). Safari y Firefox nunca lo disparan.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type PwaInstallStatus =
  | "loading"
  | "installed"   // corriendo como app instalada (standalone)
  | "available"   // el navegador ofreció el prompt nativo: se puede mostrar el botón
  | "ios"         // iOS: sin prompt programático, solo "Compartir → Agregar a inicio"
  | "manual";     // otro navegador: instalar desde su propio menú

// El evento llega una sola vez, poco después de cargar la página, casi siempre
// antes de que el usuario abra /perfil. Por eso se captura a nivel de módulo y
// no dentro del componente: si el listener se montara con la tarjeta, el evento
// ya se habría perdido. `SWRegistration` (layout raíz) importa este módulo para
// que el listener exista desde el arranque.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    // Evita la mini-infobar de Chrome: la instalación se ofrece desde el perfil.
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installedNow = true;
    emit();
  });
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari iOS expone su propia bandera en vez del media query en versiones antiguas.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  const ua = navigator.userAgent;
  // iPadOS 13+ se presenta como "Macintosh"; se distingue por la pantalla táctil.
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

function getSnapshot(): PwaInstallStatus {
  if (installedNow || isStandalone()) return "installed";
  if (deferredPrompt) return "available";
  if (isIos()) return "ios";
  return "manual";
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", cb);
  return () => {
    listeners.delete(cb);
    mq.removeEventListener("change", cb);
  };
}

export function usePwaInstall() {
  const status = useSyncExternalStore<PwaInstallStatus>(subscribe, getSnapshot, () => "loading");

  const install = useCallback(async () => {
    const prompt = deferredPrompt;
    if (!prompt) return false;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    // El evento es de un solo uso: tras mostrarlo no se puede volver a llamar a prompt().
    deferredPrompt = null;
    emit();
    return outcome === "accepted";
  }, []);

  return { status, install };
}
