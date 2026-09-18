"use client";

import { useCallback, useSyncExternalStore } from "react";

// Preferencia de UI "ocultar saldos", compartida por todas las tarjetas del
// dashboard: al tocar el ojo en una, se ocultan todas. Solo persiste un booleano;
// ningún dato financiero toca localStorage.
const STORAGE_KEY = "dashboard:balanceHidden";
// `storage` solo llega a las OTRAS pestañas; este evento avisa a la actual.
const CHANGE_EVENT = "okany:balance-hidden";

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** [oculto, alternar]. En SSR y en el primer render del cliente vale false (sin hydration mismatch). */
export function useBalanceHidden() {
  const hidden = useSyncExternalStore(subscribe, read, () => false);
  const toggle = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(!read()));
    } catch {
      // Sin almacenamiento (modo privado): la preferencia no persiste, no pasa nada
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  return [hidden, toggle] as const;
}
