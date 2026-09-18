"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { cn } from "@/lib/utils";

/**
 * Avatar del usuario para el chrome de la app (Header y Sidebar).
 *
 * En una carga completa `getMe` tarda ~1s (espera el token de Convex), y
 * mientras tanto se veía una inicial genérica que luego saltaba a la foto.
 * Se recuerda el último avatar conocido en localStorage para pintarlo apenas
 * hidrata; getMe lo confirma o corrige después. Solo guarda la URL de la foto
 * y la inicial, y se borra al cerrar sesión (clearCachedAvatar).
 */

const KEY = "okany:avatar";
const listeners = new Set<() => void>();

interface CachedAvatar {
  url: string | null;
  initial: string;
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function writeCache(value: CachedAvatar) {
  const raw = JSON.stringify(value);
  try {
    if (localStorage.getItem(KEY) === raw) return;
    localStorage.setItem(KEY, raw);
  } catch {
    return;
  }
  listeners.forEach((l) => l());
}

export function clearCachedAvatar() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // almacenamiento bloqueado: no hay nada que limpiar
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

const initialOf = (name?: string | null) => name?.trim().charAt(0).toUpperCase() || "U";

function useUserAvatar() {
  const me = useQuery(api.users.getMe);
  // null en el servidor: el caché solo existe en el navegador, y así el HTML
  // del SSR coincide con el primer render del cliente.
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const cached = useMemo<CachedAvatar | null>(() => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as CachedAvatar;
    } catch {
      return null;
    }
  }, [raw]);

  useEffect(() => {
    if (me) writeCache({ url: me.avatarUrl, initial: initialOf(me.name) });
  }, [me]);

  if (me) return { url: me.avatarUrl, initial: initialOf(me.name), pending: false };
  if (cached) return { url: cached.url, initial: cached.initial, pending: false };
  return { url: null, initial: null, pending: me === undefined };
}

export function UserAvatar({ className }: { className?: string }) {
  const { url, initial, pending } = useUserAvatar();
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  // La foto que ya estaba en la caché del navegador aparece sin fundido: el
  // fundido solo tiene sentido si hubo que esperar la descarga.
  const [instant, setInstant] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Una imagen ya en caché puede completar antes de que React enganche onLoad.
  useEffect(() => {
    const img = imgRef.current;
    if (url && img?.complete && img.naturalWidth > 0) {
      setInstant(true);
      setLoadedUrl(url);
    }
  }, [url]);

  const showImg = !!url && failedUrl !== url;

  return (
    <span
      aria-hidden
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden font-bold text-white",
        pending && "animate-pulse",
        className
      )}
      style={{
        background: pending
          ? "var(--surface-2, var(--muted))"
          : "linear-gradient(135deg, var(--os-magenta), oklch(0.32 0.14 20))",
      }}
    >
      {/* La inicial queda debajo: si la foto tarda o falla, nunca se ve un hueco */}
      {initial}
      {showImg && (
        // eslint-disable-next-line @next/next/no-img-element -- URL externa/de Convex storage, no optimizable por next/image
        <img
          ref={imgRef}
          src={url}
          alt=""
          decoding="async"
          onLoad={() => setLoadedUrl(url)}
          onError={() => setFailedUrl(url)}
          className={cn(
            "absolute inset-0 h-full w-full object-cover",
            !instant && "transition-opacity duration-200",
            loadedUrl === url ? "opacity-100" : "opacity-0"
          )}
        />
      )}
    </span>
  );
}
