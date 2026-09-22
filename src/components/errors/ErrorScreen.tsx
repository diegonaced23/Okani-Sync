"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, House, RotateCw, WifiOff } from "lucide-react";
import { BrandGlyph } from "@/components/brand/BrandGlyph";
import { cn } from "@/lib/utils";

// Pantalla compartida por not-found, error y global-error. El código de estado
// va enorme con la moneda de la marca en lugar del primer cero; debajo, una
// tarjeta de vidrio con qué pasó y qué se puede hacer.

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** En el servidor se asume conexión: el aviso de «sin internet» solo lo decide el navegador */
function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

const PILL =
  "inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold outline-none transition-[transform,background-color] duration-150 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const PRIMARY = cn(PILL, "bg-primary text-primary-foreground shadow-[0_10px_24px_-12px_var(--os-lime)] hover:brightness-105");
const SECONDARY = cn(
  PILL,
  "bg-foreground/[0.06] text-foreground shadow-[inset_0_0_0_0.5px_color-mix(in_oklch,var(--foreground)_14%,transparent)] hover:bg-foreground/10",
);

function StatusCode({ code }: { code: string }) {
  const coin = code.indexOf("0");
  return (
    <p
      aria-hidden="true"
      className="flex select-none items-center justify-center gap-1 text-[7.5rem] font-black leading-none tracking-display tabular-nums sm:text-[9rem]"
    >
      {code.split("").map((ch, i) =>
        i === coin ? (
          <span
            key={i}
            className="os-float mx-1 grid size-[6.2rem] place-items-center rounded-[1.9rem] bg-gradient-to-br from-[var(--os-lime)] to-[var(--os-cyan)] text-primary-foreground shadow-[0_24px_48px_-20px_var(--os-cyan)] sm:size-[7.4rem] sm:rounded-[2.2rem]"
          >
            <BrandGlyph size={88} />
          </span>
        ) : (
          <span key={i} className="bg-gradient-to-b from-foreground to-foreground/35 bg-clip-text text-transparent">
            {ch}
          </span>
        ),
      )}
    </p>
  );
}

export function ErrorScreen({
  code,
  title,
  detail,
  digest,
  onRetry,
  error,
  fullscreen = true,
  reloadHome = false,
}: {
  code: string;
  title: string;
  detail: string;
  /** Identificador del error en los registros del servidor (error.digest) */
  digest?: string;
  /** Con él, la acción principal es reintentar; sin él, ir al inicio */
  onRetry?: () => void;
  /** Se envía a Sentry (que solo está activo en producción) */
  error?: Error;
  /** Ocupa toda la pantalla con su propia aurora; si no, vive dentro del layout de la app */
  fullscreen?: boolean;
  /** Navega al inicio recargando la página: tras un fallo del layout raíz no hay árbol de React en el que confiar */
  reloadHome?: boolean;
}) {
  const router = useRouter();
  const online = useOnline();

  useEffect(() => {
    if (!error) return;
    // Import perezoso: el SDK de Sentry no entra en el bundle de la página hasta que falla algo
    import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error)).catch(() => {});
  }, [error]);

  // Un fallo sin conexión casi siempre es la conexión: se dice eso en vez del genérico
  const offline = onRetry !== undefined && !online;
  const shownTitle = offline ? "Estás sin conexión" : title;
  const shownDetail = offline
    ? "Revisa tu internet. Cuando vuelva, toca «Intentar de nuevo»."
    : detail;

  const home = (className: string) =>
    reloadHome ? (
      // Recarga completa a propósito: el árbol de React del que depende <Link> es justo lo que falló
      // eslint-disable-next-line @next/next/no-html-link-for-pages
      <a href="/" className={className}>
        <House className="size-[18px]" aria-hidden="true" />
        Ir al inicio
      </a>
    ) : (
      <Link href="/" className={className}>
        <House className="size-[18px]" aria-hidden="true" />
        Ir al inicio
      </Link>
    );

  // Dentro de la app ya hay un <main>: no se anida otro
  const Root = fullscreen ? "main" : "div";

  return (
    <>
      {fullscreen && <div aria-hidden="true" className="os-aurora" />}
      <Root
        className={cn(
          "relative z-10 flex flex-col items-center justify-center px-4 text-center",
          fullscreen
            ? "min-h-dvh pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]"
            : "min-h-[65dvh] py-8",
        )}
      >
        <div className="os-enter w-full max-w-md">
          {offline ? (
            <span className="os-float mx-auto grid size-24 place-items-center rounded-[1.9rem] bg-gradient-to-br from-[var(--os-orange)] to-[var(--os-magenta)] text-white shadow-[0_24px_48px_-20px_var(--os-magenta)]">
              <WifiOff className="size-11" strokeWidth={2.25} aria-hidden="true" />
            </span>
          ) : (
            <StatusCode code={code} />
          )}

          <div className="os-liquid-glass relative mt-8 rounded-[28px] px-6 pb-6 pt-7">
            <h1 className="text-2xl font-bold tracking-display text-foreground">{shownTitle}</h1>
            <p className="mx-auto mt-2 max-w-[22rem] text-[15px] leading-relaxed text-muted-foreground">{shownDetail}</p>

            <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-center">
              {onRetry ? (
                <>
                  {home(SECONDARY)}
                  <button type="button" onClick={onRetry} className={PRIMARY}>
                    <RotateCw className="size-[18px]" aria-hidden="true" />
                    Intentar de nuevo
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => router.back()} className={SECONDARY}>
                    <ArrowLeft className="size-[18px]" aria-hidden="true" />
                    Volver
                  </button>
                  {home(PRIMARY)}
                </>
              )}
            </div>

            {digest && (
              <p className="mt-5 text-xs text-muted-foreground">
                Si vuelve a pasar, comparte este código:{" "}
                <code className="select-all rounded-md bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                  {digest}
                </code>
              </p>
            )}
          </div>
        </div>
      </Root>
    </>
  );
}
