"use client";

import { useEffect } from "react";
// Solo por su efecto: registra el listener de `beforeinstallprompt` desde el
// arranque, antes de que el usuario llegue a la tarjeta de instalación del perfil.
import "@/hooks/usePwaInstall";

export function SWRegistration() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV !== "production"
    ) {
      return;
    }
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
      console.error("SW registration failed:", err);
    });
  }, []);

  return null;
}
