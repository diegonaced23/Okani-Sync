"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

/** La clave que usa next-themes por defecto para guardar la elección del dispositivo. */
const STORAGE_KEY = "theme";

/**
 * Aplica el tema guardado en la cuenta cuando el dispositivo todavía no ha elegido uno.
 *
 * `users.theme` existía en el esquema, `updateTheme` lo escribía desde el perfil y
 * **nadie lo leía nunca**: next-themes guarda la elección en `localStorage`, así que el
 * tema seguía al navegador y no a la cuenta. Elegir «Oscuro» en el teléfono y abrir la
 * aplicación en el portátil la mostraba clara, aunque la preferencia estaba guardada.
 *
 * Solo actúa cuando no hay elección local: a partir de ahí manda el dispositivo, que es
 * lo que espera quien cambia el tema con el interruptor de la cabecera. En un dispositivo
 * nuevo se ve un instante el tema por defecto antes de aplicar el de la cuenta, porque
 * ese dato llega con la sesión de Convex y no antes de pintar; el precio es ese parpadeo
 * una sola vez frente a una preferencia que no viajaba nunca.
 */
export function ThemeSync() {
  const me = useQuery(api.users.getMe);
  const { setTheme } = useTheme();
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current) return;
    const stored = me?.theme;
    if (!stored) return;
    applied.current = true;
    try {
      if (localStorage.getItem(STORAGE_KEY) === null) setTheme(stored);
    } catch {
      // Almacenamiento bloqueado: no se puede saber si el dispositivo ya eligió,
      // y sobrescribir a ciegas sería peor que no hacer nada.
    }
  }, [me?.theme, setTheme]);

  return null;
}
